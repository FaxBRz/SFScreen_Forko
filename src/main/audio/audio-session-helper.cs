using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

internal enum EDataFlow { eRender, eCapture, eAll }
internal enum ERole { eConsole, eMultimedia, eCommunications }

[Flags]
internal enum CLSCTX : uint { ALL = 23 }

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
internal class MMDeviceEnumeratorComObject { }

[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
internal interface IMMDeviceEnumerator {
  int EnumAudioEndpoints(EDataFlow dataFlow, uint stateMask, out object devices);
  int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice device);
}

[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("D666063F-1587-4E43-81F1-B948E807363F")]
internal interface IMMDevice {
  int Activate(ref Guid iid, CLSCTX context, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
}

[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F")]
internal interface IAudioSessionManager2 {
  int GetAudioSessionControl(ref Guid sessionGuid, uint streamFlags, out IntPtr control);
  int GetSimpleAudioVolume(ref Guid sessionGuid, uint streamFlags, out IntPtr volume);
  int GetSessionEnumerator(out IAudioSessionEnumerator enumerator);
}

[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8")]
internal interface IAudioSessionEnumerator {
  int GetCount(out int count);
  int GetSession(int index, out IAudioSessionControl control);
}

[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD")]
internal interface IAudioSessionControl { }

[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D")]
internal interface IAudioSessionControl2 {
  int GetState(out int state);
  int GetDisplayName(out IntPtr name);
  int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string value, IntPtr context);
  int GetIconPath(out IntPtr path);
  int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string value, IntPtr context);
  int GetGroupingParam(out Guid grouping);
  int SetGroupingParam(ref Guid grouping, IntPtr context);
  int RegisterAudioSessionNotification(IntPtr client);
  int UnregisterAudioSessionNotification(IntPtr client);
  int GetSessionIdentifier(out IntPtr identifier);
  int GetSessionInstanceIdentifier(out IntPtr identifier);
  int GetProcessId(out uint processId);
  int IsSystemSoundsSession();
  int SetDuckingPreference([MarshalAs(UnmanagedType.Bool)] bool optOut);
}

internal static class Program {
  private static string Escape(string value) {
    if (value == null) return "";
    var builder = new StringBuilder();
    foreach (char c in value) {
      if (c == '\\' || c == '"') builder.Append('\\').Append(c);
      else if (c == '\n') builder.Append("\\n");
      else if (c == '\r') builder.Append("\\r");
      else if (c >= 32) builder.Append(c);
    }
    return builder.ToString();
  }

  public static int Main() {
    var seen = new HashSet<uint>();
    var rows = new List<string>();
    object managerObject = null;
    IMMDevice device = null;
    try {
      var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
      Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eMultimedia, out device));
      Guid iid = typeof(IAudioSessionManager2).GUID;
      Marshal.ThrowExceptionForHR(device.Activate(ref iid, CLSCTX.ALL, IntPtr.Zero, out managerObject));
      var manager = (IAudioSessionManager2)managerObject;
      IAudioSessionEnumerator sessions;
      Marshal.ThrowExceptionForHR(manager.GetSessionEnumerator(out sessions));
      int count;
      Marshal.ThrowExceptionForHR(sessions.GetCount(out count));
      for (int index = 0; index < count; index++) {
        IAudioSessionControl control = null;
        try {
          if (sessions.GetSession(index, out control) < 0 || control == null) continue;
          var control2 = (IAudioSessionControl2)control;
          uint processId;
          if (control2.GetProcessId(out processId) < 0 || processId == 0 || !seen.Add(processId)) continue;
          using (var process = Process.GetProcessById((int)processId)) {
            string executable = process.ProcessName + ".exe";
            string label = String.IsNullOrWhiteSpace(process.MainWindowTitle) ? process.ProcessName : process.MainWindowTitle;
            rows.Add("{\"processId\":" + processId + ",\"executable\":\"" + Escape(executable) + "\",\"label\":\"" + Escape(label) + "\"}");
          }
        } catch { }
        finally { if (control != null && Marshal.IsComObject(control)) Marshal.ReleaseComObject(control); }
      }
      Console.Write("[" + String.Join(",", rows.ToArray()) + "]");
      return 0;
    } catch {
      Console.Write("[]");
      return 1;
    } finally {
      if (managerObject != null && Marshal.IsComObject(managerObject)) Marshal.ReleaseComObject(managerObject);
      if (device != null && Marshal.IsComObject(device)) Marshal.ReleaseComObject(device);
    }
  }
}
