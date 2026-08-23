using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

namespace SFScreen.NativeInput
{
    static class Program
    {
        [DllImport("user32.dll")]
        static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, UIntPtr dwExtraInfo);

        [DllImport("user32.dll")]
        static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        [DllImport("sas.dll", SetLastError = true)]
        static extern void SendSAS([MarshalAs(UnmanagedType.Bool)] bool asUser);

        private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

        [StructLayout(LayoutKind.Sequential)]
        private struct KbdLlHookStruct
        {
            public uint vkCode;
            public uint scanCode;
            public uint flags;
            public uint time;
            public UIntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct NativeMessage
        {
            public IntPtr hwnd;
            public uint message;
            public UIntPtr wParam;
            public IntPtr lParam;
            public uint time;
            public int ptX;
            public int ptY;
            public uint lPrivate;
        }

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc callback, IntPtr module, uint threadId);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool UnhookWindowsHookEx(IntPtr hook);

        [DllImport("user32.dll")]
        private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern int GetMessage(out NativeMessage message, IntPtr window, uint min, uint max);

        [DllImport("user32.dll")]
        private static extern bool PostThreadMessage(uint threadId, uint message, UIntPtr wParam, IntPtr lParam);

        [DllImport("kernel32.dll")]
        private static extern uint GetCurrentThreadId();

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr GetModuleHandle(string moduleName);

        private const uint MOUSEEVENTF_LEFTDOWN   = 0x0002;
        private const uint MOUSEEVENTF_LEFTUP     = 0x0004;
        private const uint MOUSEEVENTF_RIGHTDOWN  = 0x0008;
        private const uint MOUSEEVENTF_RIGHTUP    = 0x0010;
        private const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        private const uint MOUSEEVENTF_MIDDLEUP   = 0x0040;
        private const uint MOUSEEVENTF_WHEEL      = 0x0800;

        private const uint KEYEVENTF_EXTENDEDKEY  = 0x0001;
        private const uint KEYEVENTF_KEYUP        = 0x0002;
        private const int WH_KEYBOARD_LL          = 13;
        private const uint WM_KEYDOWN             = 0x0100;
        private const uint WM_KEYUP               = 0x0101;
        private const uint WM_SYSKEYDOWN          = 0x0104;
        private const uint WM_SYSKEYUP            = 0x0105;
        private const uint WM_QUIT                = 0x0012;
        private const uint LLKHF_INJECTED          = 0x0010;

        private static readonly object KeyboardLockSync = new object();
        private static Thread keyboardThread;
        private static IntPtr keyboardHook = IntPtr.Zero;
        private static uint keyboardThreadId;
        private static volatile bool keyboardLocked;
        private static LowLevelKeyboardProc keyboardHookCallback;
        private static bool ctrlDown;
        private static bool altDown;
        private static bool unlockRequested;

        private static void WriteEvent(string value)
        {
            Console.WriteLine(value);
            Console.Out.Flush();
        }

        private static void SetKeyboardLock(bool enabled)
        {
            lock (KeyboardLockSync)
            {
                if (enabled)
                {
                    if (keyboardThread != null && keyboardThread.IsAlive)
                    {
                        keyboardLocked = true;
                        return;
                    }

                    keyboardLocked = true;
                    unlockRequested = false;
                    keyboardThread = new Thread(KeyboardHookLoop);
                    keyboardThread.IsBackground = true;
                    keyboardThread.Name = "SFScreen keyboard lock";
                    keyboardThread.Start();
                }
                else
                {
                    keyboardLocked = false;
                    unlockRequested = false;
                    ctrlDown = false;
                    altDown = false;
                    if (keyboardThreadId != 0)
                    {
                        PostThreadMessage(keyboardThreadId, WM_QUIT, UIntPtr.Zero, IntPtr.Zero);
                    }
                }
            }
        }

        private static void KeyboardHookLoop()
        {
            keyboardThreadId = GetCurrentThreadId();
            keyboardHookCallback = KeyboardHook;
            keyboardHook = SetWindowsHookEx(WH_KEYBOARD_LL, keyboardHookCallback, GetModuleHandle(null), 0);
            WriteEvent(keyboardHook == IntPtr.Zero ? "LOCK_ERROR" : "LOCKED");

            NativeMessage message;
            while (GetMessage(out message, IntPtr.Zero, 0, 0) > 0) { }

            if (keyboardHook != IntPtr.Zero)
            {
                UnhookWindowsHookEx(keyboardHook);
                keyboardHook = IntPtr.Zero;
            }
            keyboardThreadId = 0;
            keyboardThread = null;
            WriteEvent("UNLOCKED");
        }

        private static IntPtr KeyboardHook(int code, IntPtr wParam, IntPtr lParam)
        {
            if (code < 0 || !keyboardLocked)
            {
                return CallNextHookEx(keyboardHook, code, wParam, lParam);
            }

            var data = (KbdLlHookStruct)Marshal.PtrToStructure(lParam, typeof(KbdLlHookStruct));
            if ((data.flags & LLKHF_INJECTED) != 0)
            {
                return CallNextHookEx(keyboardHook, code, wParam, lParam);
            }

            if (unlockRequested)
            {
                return new IntPtr(1);
            }

            uint message = unchecked((uint)wParam.ToInt64());
            bool isDown = message == WM_KEYDOWN || message == WM_SYSKEYDOWN;
            bool isUp = message == WM_KEYUP || message == WM_SYSKEYUP;
            if (!isDown && !isUp)
            {
                return new IntPtr(1);
            }

            uint vk = data.vkCode;
            if (vk == 0x11 || vk == 0xA2 || vk == 0xA3) ctrlDown = isDown;
            if (vk == 0x12 || vk == 0xA4 || vk == 0xA5) altDown = isDown;

            // Ctrl+Alt+A remains the explicit escape hatch. It is consumed
            // locally and never reaches Windows or the remote computer.
            if (isDown && vk == 0x41 && ctrlDown && altDown)
            {
                unlockRequested = true;
                WriteEvent("UNLOCK_REQUEST");
                return new IntPtr(1);
            }

            WriteEvent(String.Format("KEY {0} {1} {2} {3}", isDown ? "D" : "U", vk, data.scanCode, data.flags));
            return new IntPtr(1);
        }

        static void Main(string[] args)
        {
            Console.WriteLine("READY");
            Console.Out.Flush();

            string line;
            while ((line = Console.ReadLine()) != null)
            {
                if (line.Length == 0) continue;

                try
                {
                    var parts = line.Split(' ');
                    var cmd = parts[0];

                    if (cmd == "M" && parts.Length >= 3)
                    {
                        int x = int.Parse(parts[1]);
                        int y = int.Parse(parts[2]);
                        SetCursorPos(x, y);
                    }
                    else if (cmd == "D" && parts.Length >= 4)
                    {
                        int btn = int.Parse(parts[1]);
                        int x = int.Parse(parts[2]);
                        int y = int.Parse(parts[3]);
                        SetCursorPos(x, y);

                        uint flag = btn == 2 ? MOUSEEVENTF_RIGHTDOWN : (btn == 3 ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_LEFTDOWN);
                        mouse_event(flag, 0, 0, 0, UIntPtr.Zero);
                    }
                    else if (cmd == "U" && parts.Length >= 4)
                    {
                        int btn = int.Parse(parts[1]);
                        int x = int.Parse(parts[2]);
                        int y = int.Parse(parts[3]);
                        SetCursorPos(x, y);

                        uint flag = btn == 2 ? MOUSEEVENTF_RIGHTUP : (btn == 3 ? MOUSEEVENTF_MIDDLEUP : MOUSEEVENTF_LEFTUP);
                        mouse_event(flag, 0, 0, 0, UIntPtr.Zero);
                    }
                    else if (cmd == "W" && parts.Length >= 4)
                    {
                        int delta = int.Parse(parts[1]);
                        int x = int.Parse(parts[2]);
                        int y = int.Parse(parts[3]);
                        SetCursorPos(x, y);
                        mouse_event(MOUSEEVENTF_WHEEL, 0, 0, (uint)delta, UIntPtr.Zero);
                    }
                    else if (cmd == "KD" && parts.Length >= 2)
                    {
                        byte vk = byte.Parse(parts[1]);
                        bool ext = parts.Length >= 3 && parts[2] == "1";
                        keybd_event(vk, 0, ext ? KEYEVENTF_EXTENDEDKEY : 0, UIntPtr.Zero);
                    }
                    else if (cmd == "KU" && parts.Length >= 2)
                    {
                        byte vk = byte.Parse(parts[1]);
                        bool ext = parts.Length >= 3 && parts[2] == "1";
                        keybd_event(vk, 0, KEYEVENTF_KEYUP | (ext ? KEYEVENTF_EXTENDEDKEY : 0), UIntPtr.Zero);
                    }
                    else if (cmd == "WIN")
                    {
                        keybd_event(0x5B, 0, 0, UIntPtr.Zero);
                        Thread.Sleep(15);
                        keybd_event(0x5B, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                    }
                    else if (cmd == "CAD")
                    {
                        try { SendSAS(false); } catch { }
                    }
                    else if (cmd == "LOCK" && parts.Length >= 2)
                    {
                        SetKeyboardLock(parts[1] == "1");
                    }
                    else if (cmd == "PING")
                    {
                        Console.WriteLine("PONG");
                        Console.Out.Flush();
                    }
                }
                catch
                {
                    // Ignore malformed lines to prevent helper crash
                }
            }

            SetKeyboardLock(false);
        }
    }
}
