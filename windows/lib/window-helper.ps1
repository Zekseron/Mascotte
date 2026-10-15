$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
public static class MascotteWindowGeometry {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT rect);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, System.Text.StringBuilder name, int count);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attribute, out RECT rect, int count);
  [DllImport("dwmapi.dll", EntryPoint="DwmGetWindowAttribute")] static extern int GetCloaked(IntPtr h, int attribute, out int value, int count);
  public static void Run() {
    SetProcessDpiAwarenessContext(new IntPtr(-4));
    IntPtr target = GetForegroundWindow(); uint pid; GetWindowThreadProcessId(target, out pid);
    var name = new System.Text.StringBuilder(256); GetClassName(target, name, 256);
    string cls = name.ToString();
    uint hostPID; UInt32.TryParse(Environment.GetEnvironmentVariable("MASCOTTE_HOST_PID"), out hostPID);
    if (target == IntPtr.Zero || pid == hostPID || cls == "Shell_TrayWnd" || cls == "Shell_SecondaryTrayWnd" || cls == "Progman" || cls == "WorkerW") {
      Console.WriteLine("{\"status\":\"unavailable\"}"); return;
    }
    Task<string> input = Task.Run(() => Console.ReadLine()); bool paused = false; string previous = null;
    while (true) {
      if (input.IsCompleted) {
        string command = input.Result; if (command == null || command == "stop") return;
        if (command == "pause") paused = true; if (command == "resume") paused = false;
        input = Task.Run(() => Console.ReadLine());
      }
      if (!paused) {
        uint currentPID; GetWindowThreadProcessId(target, out currentPID);
        if (!IsWindow(target) || pid != currentPID) { Console.WriteLine("{\"status\":\"closed\"}"); return; }
        RECT rect; int cloaked;
        GetCloaked(target, 14, out cloaked, 4);
        string json;
        if (IsIconic(target) || !IsWindowVisible(target) || cloaked != 0) json = "{\"status\":\"hidden\"}";
        else {
          if (DwmGetWindowAttribute(target, 9, out rect, Marshal.SizeOf(typeof(RECT))) != 0 && !GetWindowRect(target, out rect)) {
            Console.WriteLine("{\"status\":\"unavailable\"}"); return;
          }
          json = "{\"status\":\"visible\",\"x\":" + rect.Left + ",\"y\":" + rect.Top + ",\"width\":" + (rect.Right-rect.Left) + ",\"height\":" + (rect.Bottom-rect.Top) + "}";
        }
        if (json != previous) { Console.WriteLine(json); Console.Out.Flush(); previous = json; }
      }
      Thread.Sleep(200);
    }
  }
}
'@
[MascotteWindowGeometry]::Run()
