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

        private const uint MOUSEEVENTF_LEFTDOWN   = 0x0002;
        private const uint MOUSEEVENTF_LEFTUP     = 0x0004;
        private const uint MOUSEEVENTF_RIGHTDOWN  = 0x0008;
        private const uint MOUSEEVENTF_RIGHTUP    = 0x0010;
        private const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        private const uint MOUSEEVENTF_MIDDLEUP   = 0x0040;
        private const uint MOUSEEVENTF_WHEEL      = 0x0800;

        private const uint KEYEVENTF_EXTENDEDKEY  = 0x0001;
        private const uint KEYEVENTF_KEYUP        = 0x0002;

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
        }
    }
}
