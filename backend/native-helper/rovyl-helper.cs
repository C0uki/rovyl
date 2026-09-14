using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace Rovyl.NativeHelper {
    public struct ROVYLRECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public static class RovylForeground {
        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr lpdwProcessId);
        [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
        [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool SetProcessWorkingSetSize(IntPtr hProcess, IntPtr min, IntPtr max);
    }

    public static class RovylSnapshot {
        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out int pid);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
        [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out ROVYLRECT lpRect);
        [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr hWnd, EnumWindowsProc cb, IntPtr lParam);
        [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
        [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern IntPtr OpenProcess(int access, bool inherit, int pid);
        [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        public static extern bool QueryFullProcessImageNameW(IntPtr h, int flags, StringBuilder buf, ref int size);
        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool SetProcessWorkingSetSize(IntPtr hProcess, IntPtr min, IntPtr max);

        const int PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
        const int PROCESS_SET_QUOTA = 0x0100;

        public static bool TrimProcessMemory(int pid) {
            if (pid <= 0) return false;
            IntPtr h = OpenProcess(PROCESS_SET_QUOTA | PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
            if (h == IntPtr.Zero) return false;
            try {
                return SetProcessWorkingSetSize(h, (IntPtr)(-1), (IntPtr)(-1));
            } finally {
                CloseHandle(h);
            }
        }

        public static int TrimProcesses(int[] pids) {
            int count = 0;
            if (pids == null) return 0;
            for (int i = 0; i < pids.Length; i++) {
                if (TrimProcessMemory(pids[i])) count++;
            }
            return count;
        }

        public static void MatchElectronDpiAwareness() {
            try { if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return; } catch { }
            try { SetProcessDPIAware(); } catch { }
        }

        static string ProcessPath(int pid) {
            if (pid <= 0) return "";
            IntPtr h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
            if (h == IntPtr.Zero) return "";
            try {
                StringBuilder sb = new StringBuilder(1024);
                int size = sb.Capacity;
                if (QueryFullProcessImageNameW(h, 0, sb, ref size)) return sb.ToString(0, size);
                return "";
            } finally {
                CloseHandle(h);
            }
        }

        static readonly EnumWindowsProc childCallback = OnChildWindow;
        static IntPtr uwpChild;
        static string frameHostPath;

        static bool OnChildWindow(IntPtr hWnd, IntPtr lParam) {
            int pid;
            GetWindowThreadProcessId(hWnd, out pid);
            string candidate = ProcessPath(pid);
            if (candidate.Length > 0 && !candidate.Equals(frameHostPath, StringComparison.OrdinalIgnoreCase)) {
                uwpChild = hWnd;
                return false;
            }
            return true;
        }

        public static string Snapshot() {
            IntPtr hWnd = GetForegroundWindow();
            if (hWnd == IntPtr.Zero) return "||";
            int pid;
            GetWindowThreadProcessId(hWnd, out pid);
            string exe = ProcessPath(pid);

            if (exe.Length > 0 &&
                string.Equals(Path.GetFileName(exe), "ApplicationFrameHost.exe", StringComparison.OrdinalIgnoreCase)) {
                uwpChild = IntPtr.Zero;
                frameHostPath = exe;
                try {
                    EnumChildWindows(hWnd, childCallback, IntPtr.Zero);
                    if (uwpChild != IntPtr.Zero) {
                        int childPid;
                        GetWindowThreadProcessId(uwpChild, out childPid);
                        string childExe = ProcessPath(childPid);
                        if (childExe.Length > 0) exe = childExe;
                    }
                } catch { }
            }

            StringBuilder title = new StringBuilder(1024);
            GetWindowTextW(hWnd, title, title.Capacity);
            string caption = title.ToString().Replace('\r', ' ').Replace('\n', ' ');

            string bounds = "";
            ROVYLRECT r;
            if (GetWindowRect(hWnd, out r)) {
                int w = Math.Max(0, r.Right - r.Left);
                int h = Math.Max(0, r.Bottom - r.Top);
                bounds = r.Left + "," + r.Top + "," + w + "," + h;
            }

            return bounds + "|" + exe + "|" + caption;
        }
    }

    public static class RovylForegroundFocus {
        public static string InvokeForegroundSteal(string rawHandle) {
            long value = 0;
            if (!long.TryParse(rawHandle, out value) || value == 0) return "BADHWND";
            IntPtr target = new IntPtr(value);
            if (!RovylForeground.IsWindowVisible(target)) return "HIDDEN";
            if (RovylForeground.GetForegroundWindow() == target) return "ALREADY";

            IntPtr foreground = RovylForeground.GetForegroundWindow();
            uint foregroundThread = RovylForeground.GetWindowThreadProcessId(foreground, IntPtr.Zero);
            uint targetThread = RovylForeground.GetWindowThreadProcessId(target, IntPtr.Zero);
            uint selfThread = RovylForeground.GetCurrentThreadId();

            bool attachedForeground = false;
            bool attachedTarget = false;
            try {
                if (foregroundThread != 0 && foregroundThread != selfThread) {
                    attachedForeground = RovylForeground.AttachThreadInput(selfThread, foregroundThread, true);
                }
                if (targetThread != 0 && targetThread != selfThread) {
                    attachedTarget = RovylForeground.AttachThreadInput(selfThread, targetThread, true);
                }

                RovylForeground.ShowWindow(target, 5);
                RovylForeground.BringWindowToTop(target);
                RovylForeground.SetForegroundWindow(target);
                RovylForeground.SetFocus(target);
            } finally {
                if (attachedTarget) RovylForeground.AttachThreadInput(selfThread, targetThread, false);
                if (attachedForeground) RovylForeground.AttachThreadInput(selfThread, foregroundThread, false);
            }

            if (RovylForeground.GetForegroundWindow() == target) return "OK";
            return "MISS";
        }

        public static void Run() {
            RovylSnapshot.MatchElectronDpiAwareness();
            Console.WriteLine("READY");

            string line;
            while ((line = Console.ReadLine()) != null) {
                line = line.Trim();
                if (string.IsNullOrEmpty(line)) continue;
                if (line == "EXIT") break;
                if (line == "FG") {
                    try {
                        Console.WriteLine("FG|" + RovylSnapshot.Snapshot());
                    } catch {
                        Console.WriteLine("FG|||");
                    }
                    continue;
                }
                string[] parts = line.Split(' ');
                if (parts[0] == "TRIM") {
                    try {
                        List<int> pids = new List<int>();
                        if (parts.Length > 1 && !string.IsNullOrEmpty(parts[1])) {
                            foreach (string s in parts[1].Split(',')) {
                                int p;
                                if (int.TryParse(s.Trim(), out p)) pids.Add(p);
                            }
                        }
                        int trimmed = RovylSnapshot.TrimProcesses(pids.ToArray());
                        RovylSnapshot.TrimProcessMemory(Process.GetCurrentProcess().Id);
                        Console.WriteLine("TRIM|OK|" + trimmed);
                    } catch (Exception ex) {
                        Console.WriteLine("TRIM|ERR|" + ex.Message);
                    }
                    continue;
                }
                if (parts[0] != "FOCUS" || parts.Length < 2) continue;
                try {
                    Console.WriteLine(InvokeForegroundSteal(parts[1]));
                } catch (Exception ex) {
                    Console.WriteLine("ERR " + ex.Message);
                }
            }
        }
    }

    public static class ZenithRadialMouseBlocker {
        private const int WH_MOUSE_LL = 14;
        private const int WM_MOUSEMOVE = 0x0200;
        private const int WM_LBUTTONDOWN = 0x0201;
        private const int WM_LBUTTONUP = 0x0202;
        private const int WM_LBUTTONDBLCLK = 0x0203;
        private const int WM_RBUTTONDOWN = 0x0204;
        private const int WM_RBUTTONUP = 0x0205;
        private const int WM_RBUTTONDBLCLK = 0x0206;
        private const int WM_MBUTTONDOWN = 0x0207;
        private const int WM_MBUTTONUP = 0x0208;
        private const int WM_MBUTTONDBLCLK = 0x0209;
        private const int WM_MOUSEWHEEL = 0x020A;
        private const int WM_XBUTTONDOWN = 0x020B;
        private const int WM_XBUTTONUP = 0x020C;
        private const int WM_XBUTTONDBLCLK = 0x020D;
        private const int WM_MOUSEHWHEEL = 0x020E;

        private const int MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        private const int MOUSEEVENTF_MIDDLEUP = 0x0040;
        private const int MOUSEEVENTF_XDOWN = 0x0080;
        private const int MOUSEEVENTF_XUP = 0x0100;

        private const uint SYNCHRONIZE = 0x00100000;
        private const uint INFINITE = 0xFFFFFFFF;
        private const uint SYNTHETIC_TAG = 0x524F5659;

        private delegate IntPtr LowLevelMouseProc(int nCode, IntPtr wParam, IntPtr lParam);

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT { public int x; public int y; }

        [StructLayout(LayoutKind.Sequential)]
        private struct MSLLHOOKSTRUCT {
            public POINT pt;
            public uint mouseData;
            public uint flags;
            public uint time;
            public UIntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct MOUSEINPUT {
            public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public UIntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct INPUT { public uint type; public MOUSEINPUT mi; }

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelMouseProc callback, IntPtr module, uint threadId);
        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool UnhookWindowsHookEx(IntPtr hook);
        [DllImport("user32.dll")]
        private static extern IntPtr CallNextHookEx(IntPtr hook, int nCode, IntPtr wParam, IntPtr lParam);
        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr GetModuleHandle(string moduleName);
        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint SendInput(uint count, INPUT[] inputs, int size);
        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SetCursorPos(int x, int y);
        [DllImport("user32.dll")]
        private static extern bool GetCursorPos(out POINT point);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr OpenProcess(uint access, bool inheritHandle, int processId);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr handle);
        [DllImport("user32.dll")]
        private static extern short GetKeyState(int nVirtKey);
        [DllImport("user32.dll")]
        private static extern short GetAsyncKeyState(int nVirtKey);

        private const int VK_LBUTTON = 0x01;
        private const int VK_RBUTTON = 0x02;
        private const int VK_MBUTTON = 0x04;
        private const int VK_SHIFT = 0x10;
        private const int VK_CONTROL = 0x11;
        private const int VK_MENU = 0x12;
        private const int VK_LWIN = 0x5B;
        private const int VK_RWIN = 0x5C;

        private static int GetCurrentModifierMask() {
            int mask = 0;
            if ((GetKeyState(VK_CONTROL) & 0x8000) != 0) mask |= 1;
            if ((GetKeyState(VK_MENU) & 0x8000) != 0) mask |= 2;
            if ((GetKeyState(VK_SHIFT) & 0x8000) != 0) mask |= 4;
            if (((GetKeyState(VK_LWIN) & 0x8000) != 0) || ((GetKeyState(VK_RWIN) & 0x8000) != 0)) mask |= 8;
            return mask;
        }

        private static readonly ConcurrentQueue<string> Commands = new ConcurrentQueue<string>();
        private static readonly ConcurrentQueue<int> Passthroughs = new ConcurrentQueue<int>();
        private static readonly ConcurrentQueue<string> Outbound = new ConcurrentQueue<string>();
        private static readonly AutoResetEvent OutboundSignal = new AutoResetEvent(false);
        private static readonly LowLevelMouseProc Callback = HookCallback;
        private static IntPtr Hook = IntPtr.Zero;
        private static volatile bool Blocking;
        private static int Left, Top, Right, Bottom;
        private static int MonitorLeft, MonitorTop, MonitorRight, MonitorBottom;

        /**
         * One-shot: "tell me when no mouse button is held any more".
         *
         * Polled rather than hooked, because the asker is the tray menu and the hook is not even
         * installed while the app idles. `GetAsyncKeyState` reads the PHYSICAL buttons, so a
         * swapped-buttons mouse needs no special case as long as all three are watched.
         */
        private static volatile bool AwaitingButtonsUp;
        /** `Environment.TickCount` at which the wait gives up and answers anyway. */
        private static volatile int ButtonsUpDeadline;

        private static volatile bool RecordingMode;
        private static volatile int ShortcutTriggerButton;
        private static volatile int ShortcutTriggerModMask;
        private static volatile bool ShortcutTriggerActive;

        private static readonly int OffsetPoint = (int)Marshal.OffsetOf(typeof(MSLLHOOKSTRUCT), "pt");
        private static readonly int OffsetMouseData = (int)Marshal.OffsetOf(typeof(MSLLHOOKSTRUCT), "mouseData");
        private static readonly int OffsetExtraInfo = (int)Marshal.OffsetOf(typeof(MSLLHOOKSTRUCT), "dwExtraInfo");

        private static volatile int TriggerButton;
        private static volatile bool TriggerHoldMode;
        private static volatile int TriggerThreshold;
        private static int DownX, DownY;
        private static long DownAt;

        private const long PASSTHROUGH_MAX_MS = 250;
        private const int DEFAULT_CLICK_HOLD_MS = 400;
        private static volatile int ClickHoldMs = DEFAULT_CLICK_HOLD_MS;
        private const int DEFAULT_CLICK_DRAG_PX = 30;
        private static volatile int ClickDragPx = DEFAULT_CLICK_DRAG_PX;
        private static volatile bool ClickPressArmed;
        private static volatile int ClickInjectedButton;

        private const int PT_PAIR = 0;
        private const int PT_DOWN = 1000;
        private const int PT_UP = 2000;

        private static void Emit(string line) {
            Outbound.Enqueue(line);
            OutboundSignal.Set();
        }

        private static void DrainOutbound() {
            string line;
            while (Outbound.TryDequeue(out line)) {
                Console.WriteLine(line);
                Console.Out.Flush();
            }
        }

        private static bool IsBlockedMessage(int message) {
            return message == WM_LBUTTONDOWN || message == WM_LBUTTONUP || message == WM_LBUTTONDBLCLK ||
                   message == WM_RBUTTONDOWN || message == WM_RBUTTONUP || message == WM_RBUTTONDBLCLK ||
                   message == WM_MBUTTONDOWN || message == WM_MBUTTONUP || message == WM_MBUTTONDBLCLK ||
                   message == WM_XBUTTONDOWN || message == WM_XBUTTONUP || message == WM_XBUTTONDBLCLK ||
                   message == WM_MOUSEWHEEL || message == WM_MOUSEHWHEEL;
        }

        private static int TriggerFor(int message, uint mouseData, out bool isDown) {
            isDown = false;
            if (message == WM_MBUTTONDOWN || message == WM_MBUTTONUP || message == WM_MBUTTONDBLCLK) {
                isDown = (message != WM_MBUTTONUP);
                return 4;
            }
            if (message == WM_XBUTTONDOWN || message == WM_XBUTTONUP || message == WM_XBUTTONDBLCLK) {
                isDown = (message != WM_XBUTTONUP);
                int which = (int)((mouseData >> 16) & 0xFFFF);
                return which == 2 ? 6 : 5;
            }
            return 0;
        }

        private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
            if (nCode < 0) return CallNextHookEx(Hook, nCode, wParam, lParam);

            int message = wParam.ToInt32();
            if (message == WM_MOUSEMOVE) return CallNextHookEx(Hook, nCode, wParam, lParam);

            int trigger = TriggerButton;
            bool blocking = Blocking;
            int shortcutTrigger = ShortcutTriggerButton;
            bool recording = RecordingMode;
            if (trigger == 0 && !blocking && shortcutTrigger == 0 && !recording) return CallNextHookEx(Hook, nCode, wParam, lParam);

            ulong extraInfo = IntPtr.Size == 8
                ? (ulong)Marshal.ReadInt64(lParam, OffsetExtraInfo)
                : (ulong)(uint)Marshal.ReadInt32(lParam, OffsetExtraInfo);

            if ((uint)extraInfo == SYNTHETIC_TAG) {
                return CallNextHookEx(Hook, nCode, wParam, lParam);
            }

            if (recording) {
                if (message == WM_MBUTTONDOWN || message == WM_XBUTTONDOWN || message == WM_RBUTTONDOWN) {
                    string btnName = null;
                    if (message == WM_MBUTTONDOWN) {
                        btnName = "Middle";
                    } else if (message == WM_XBUTTONDOWN) {
                        uint mouseData = (uint)Marshal.ReadInt32(lParam, OffsetMouseData);
                        int xwhich = (int)((mouseData >> 16) & 0xFFFF);
                        btnName = (xwhich == 2 ? "Mouse5" : "Mouse4");
                    } else if (message == WM_RBUTTONDOWN) {
                        int mods = GetCurrentModifierMask();
                        if (mods != 0) btnName = "RightClick";
                    }

                    if (btnName != null) {
                        int mods = GetCurrentModifierMask();
                        Emit("RECORD_MOUSE " + btnName + " " + mods);
                        return new IntPtr(1);
                    }
                }
            }

            if (shortcutTrigger != 0) {
                bool isDown = false;
                bool isUp = false;
                int which = 0;
                if (message == WM_MBUTTONDOWN || message == WM_MBUTTONUP) {
                    which = 4;
                    isDown = (message == WM_MBUTTONDOWN);
                    isUp = (message == WM_MBUTTONUP);
                } else if (message == WM_XBUTTONDOWN || message == WM_XBUTTONUP) {
                    uint mouseData = (uint)Marshal.ReadInt32(lParam, OffsetMouseData);
                    int xwhich = (int)((mouseData >> 16) & 0xFFFF);
                    which = (xwhich == 2 ? 6 : 5);
                    isDown = (message == WM_XBUTTONDOWN);
                    isUp = (message == WM_XBUTTONUP);
                } else if (message == WM_RBUTTONDOWN || message == WM_RBUTTONUP) {
                    which = 2;
                    isDown = (message == WM_RBUTTONDOWN);
                    isUp = (message == WM_RBUTTONUP);
                }

                if (which == shortcutTrigger) {
                    if (isDown) {
                        int mods = GetCurrentModifierMask();
                        if (mods == ShortcutTriggerModMask) {
                            ShortcutTriggerActive = true;
                            Emit("SHORTCUT_DOWN");
                            return new IntPtr(1);
                        }
                    } else if (isUp && ShortcutTriggerActive) {
                        ShortcutTriggerActive = false;
                        Emit("SHORTCUT_UP");
                        return new IntPtr(1);
                    }
                }
            }

            int px = Marshal.ReadInt32(lParam, OffsetPoint);
            int py = Marshal.ReadInt32(lParam, OffsetPoint + 4);

            if (trigger != 0) {
                bool isDown;
                uint mouseData = (uint)Marshal.ReadInt32(lParam, OffsetMouseData);
                int which = TriggerFor(message, mouseData, out isDown);
                if (which == trigger) {
                    if (isDown) {
                        DownX = px;
                        DownY = py;
                        DownAt = Environment.TickCount;
                        ClickPressArmed = !TriggerHoldMode;
                        Emit("TRIGGER_DOWN");
                    } else {
                        int dx = px - DownX;
                        int dy = py - DownY;
                        long held = Environment.TickCount - DownAt;
                        if (held < 0) held = int.MaxValue;
                        int threshold = TriggerThreshold;
                        if (TriggerHoldMode) {
                            Emit("TRIGGER_UP");
                            if (held <= PASSTHROUGH_MAX_MS &&
                                (dx * dx + dy * dy) <= threshold * threshold) {
                                Passthroughs.Enqueue(PT_PAIR + trigger);
                            }
                        } else {
                            bool armed = ClickPressArmed;
                            ClickPressArmed = false;
                            int injected = ClickInjectedButton;
                            if (injected != 0) {
                                ClickInjectedButton = 0;
                                Passthroughs.Enqueue(PT_UP + injected);
                                Emit("TRIGGER_HOLD");
                            } else if (!armed || held >= ClickHoldMs ||
                                       (dx * dx + dy * dy) >= ClickDragPx * ClickDragPx) {
                                Emit("TRIGGER_HOLD");
                            } else {
                                Emit("TRIGGER_UP");
                            }
                        }
                    }
                    return new IntPtr(1);
                }
            }

            if (blocking && IsBlockedMessage(message)) {
                bool insideAllowed = px >= Left && px < Right && py >= Top && py < Bottom;
                bool insideMonitor = px >= MonitorLeft && px < MonitorRight &&
                                     py >= MonitorTop && py < MonitorBottom;
                if (insideMonitor && !insideAllowed) return new IntPtr(1);
            }

            return CallNextHookEx(Hook, nCode, wParam, lParam);
        }

        private static void SendPassthrough(int code) {
            int trigger = code % 1000;
            int kind = code - trigger;
            uint downFlag, upFlag, data;
            if (trigger == 4) { downFlag = MOUSEEVENTF_MIDDLEDOWN; upFlag = MOUSEEVENTF_MIDDLEUP; data = 0; }
            else { downFlag = MOUSEEVENTF_XDOWN; upFlag = MOUSEEVENTF_XUP; data = (uint)(trigger == 6 ? 2 : 1); }

            bool wantDown = kind != PT_UP;
            bool wantUp = kind != PT_DOWN;
            int count = (wantDown ? 1 : 0) + (wantUp ? 1 : 0);
            if (count == 0) return;

            var inputs = new INPUT[count];
            int i = 0;
            if (wantDown) {
                inputs[i].type = 0;
                inputs[i].mi = new MOUSEINPUT { dwFlags = downFlag, mouseData = data, dwExtraInfo = new UIntPtr(SYNTHETIC_TAG) };
                i++;
            }
            if (wantUp) {
                inputs[i].type = 0;
                inputs[i].mi = new MOUSEINPUT { dwFlags = upFlag, mouseData = data, dwExtraInfo = new UIntPtr(SYNTHETIC_TAG) };
            }
            SendInput((uint)count, inputs, Marshal.SizeOf(typeof(INPUT)));
        }

        private static void ReleaseInjectedButton() {
            int injected = ClickInjectedButton;
            ClickPressArmed = false;
            if (injected == 0) return;
            ClickInjectedButton = 0;
            SendPassthrough(PT_UP + injected);
        }

        private static void InstallHook() {
            if (Hook != IntPtr.Zero) return;
            using (var process = Process.GetCurrentProcess())
            using (var module = process.MainModule) {
                Hook = SetWindowsHookEx(WH_MOUSE_LL, Callback, GetModuleHandle(module.ModuleName), 0);
            }
        }

        private static void ReleaseHookIfIdle() {
            if (Blocking || TriggerButton != 0 || ShortcutTriggerButton != 0 || RecordingMode) return;
            if (Hook != IntPtr.Zero) {
                UnhookWindowsHookEx(Hook);
                Hook = IntPtr.Zero;
            }
        }

        private static void DisableBlocking() {
            Blocking = false;
            ReleaseHookIfIdle();
        }

        private static void Apply(string command, ApplicationContext context) {
            var parts = command.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 0) return;

            if (parts.Length == 9 && parts[0] == "BLOCK") {
                int x, y, width, height, monitorX, monitorY, monitorWidth, monitorHeight;
                if (int.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out x) &&
                    int.TryParse(parts[2], NumberStyles.Integer, CultureInfo.InvariantCulture, out y) &&
                    int.TryParse(parts[3], NumberStyles.Integer, CultureInfo.InvariantCulture, out width) &&
                    int.TryParse(parts[4], NumberStyles.Integer, CultureInfo.InvariantCulture, out height) &&
                    int.TryParse(parts[5], NumberStyles.Integer, CultureInfo.InvariantCulture, out monitorX) &&
                    int.TryParse(parts[6], NumberStyles.Integer, CultureInfo.InvariantCulture, out monitorY) &&
                    int.TryParse(parts[7], NumberStyles.Integer, CultureInfo.InvariantCulture, out monitorWidth) &&
                    int.TryParse(parts[8], NumberStyles.Integer, CultureInfo.InvariantCulture, out monitorHeight)) {
                    Left = x; Top = y; Right = x + width; Bottom = y + height;
                    MonitorLeft = monitorX; MonitorTop = monitorY;
                    MonitorRight = monitorX + monitorWidth; MonitorBottom = monitorY + monitorHeight;
                    InstallHook();
                    Blocking = Hook != IntPtr.Zero;
                }
            } else if (parts[0] == "UNBLOCK") {
                DisableBlocking();
            } else if (parts[0] == "TRIGGER") {
                ReleaseInjectedButton();
                if (parts.Length >= 2 && parts[1] == "OFF") {
                    TriggerButton = 0;
                    ReleaseHookIfIdle();
                    Emit("TRIGGER_OFF");
                    return;
                }
                int vk, threshold;
                if ((parts.Length >= 4 && parts.Length <= 6) &&
                    int.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out vk) &&
                    int.TryParse(parts[3], NumberStyles.Integer, CultureInfo.InvariantCulture, out threshold)) {
                    if (vk != 4 && vk != 5 && vk != 6) vk = 4;
                    TriggerHoldMode = parts[2] != "click";
                    TriggerThreshold = threshold > 0 ? threshold : 0;
                    int clickHold;
                    ClickHoldMs = (parts.Length >= 5 &&
                        int.TryParse(parts[4], NumberStyles.Integer, CultureInfo.InvariantCulture, out clickHold) &&
                        clickHold > 0)
                        ? clickHold
                        : DEFAULT_CLICK_HOLD_MS;
                    int clickDrag;
                    ClickDragPx = (parts.Length >= 6 &&
                        int.TryParse(parts[5], NumberStyles.Integer, CultureInfo.InvariantCulture, out clickDrag) &&
                        clickDrag > 0)
                        ? clickDrag
                        : DEFAULT_CLICK_DRAG_PX;
                    InstallHook();
                    TriggerButton = Hook != IntPtr.Zero ? vk : 0;
                    Emit(TriggerButton != 0 ? "TRIGGER_READY" : "TRIGGER_FAILED");
                }
            } else if (parts[0] == "RECORD") {
                if (parts.Length >= 2 && parts[1] == "ON") {
                    RecordingMode = true;
                    InstallHook();
                    Emit("RECORD_READY");
                } else {
                    RecordingMode = false;
                    ReleaseHookIfIdle();
                    Emit("RECORD_OFF");
                }
            } else if (parts[0] == "SHORTCUT_TRIGGER") {
                if (parts.Length >= 2 && parts[1] == "OFF") {
                    ShortcutTriggerButton = 0;
                    ShortcutTriggerModMask = 0;
                    ShortcutTriggerActive = false;
                    ReleaseHookIfIdle();
                    Emit("SHORTCUT_TRIGGER_OFF");
                    return;
                }
                int vk, modMask;
                if (parts.Length >= 3 &&
                    int.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out vk) &&
                    int.TryParse(parts[2], NumberStyles.Integer, CultureInfo.InvariantCulture, out modMask)) {
                    ShortcutTriggerButton = vk;
                    ShortcutTriggerModMask = modMask;
                    ShortcutTriggerActive = false;
                    InstallHook();
                    Emit(Hook != IntPtr.Zero ? "SHORTCUT_TRIGGER_READY" : "SHORTCUT_TRIGGER_FAILED");
                }
            } else if (parts[0] == "BUTTONS_UP") {
                /**
                 * One-shot wait, answered on the timer thread. The tray menu asks for it before it
                 * steals the foreground: taking it while the button is still down cancels the
                 * notification area's own click and the taskbar pops ITS menu on the release.
                 */
                int timeoutMs;
                if (parts.Length < 2 ||
                    !int.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out timeoutMs) ||
                    timeoutMs <= 0) {
                    timeoutMs = 400;
                }
                ButtonsUpDeadline = Environment.TickCount + timeoutMs;
                AwaitingButtonsUp = true;
            } else if (parts.Length == 3 && parts[0] == "WARP") {
                int wx, wy;
                if (int.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out wx) &&
                    int.TryParse(parts[2], NumberStyles.Integer, CultureInfo.InvariantCulture, out wy)) {
                    SetCursorPos(wx, wy);
                }
            } else if (parts[0] == "EXIT") {
                AwaitingButtonsUp = false;
                ReleaseInjectedButton();
                TriggerButton = 0;
                ShortcutTriggerButton = 0;
                ShortcutTriggerModMask = 0;
                ShortcutTriggerActive = false;
                RecordingMode = false;
                DisableBlocking();
                context.ExitThread();
            }
        }

        public static void Run(int parentPid) {
            var context = new ApplicationContext();

            var output = new Thread(() => {
                while (true) {
                    OutboundSignal.WaitOne();
                    DrainOutbound();
                }
            });
            output.IsBackground = true;
            output.Start();

            var input = new Thread(() => {
                string line;
                while ((line = Console.ReadLine()) != null) Commands.Enqueue(line);
                Commands.Enqueue("EXIT");
            });
            input.IsBackground = true;
            input.Start();

            var parentWatch = new Thread(() => {
                IntPtr handle = OpenProcess(SYNCHRONIZE, false, parentPid);
                if (handle == IntPtr.Zero) return;
                WaitForSingleObject(handle, INFINITE);
                CloseHandle(handle);
                Commands.Enqueue("EXIT");
            });
            parentWatch.IsBackground = true;
            parentWatch.Start();

            var timer = new System.Windows.Forms.Timer();
            timer.Interval = 15;
            timer.Tick += (sender, args) => {
                string command;
                while (Commands.TryDequeue(out command)) Apply(command, context);

                if (AwaitingButtonsUp) {
                    bool anyDown = (GetAsyncKeyState(VK_LBUTTON) & 0x8000) != 0 ||
                                   (GetAsyncKeyState(VK_RBUTTON) & 0x8000) != 0 ||
                                   (GetAsyncKeyState(VK_MBUTTON) & 0x8000) != 0;
                    /** Subtraction, not `>`: TickCount wraps every 49 days and a wrap must not hang the wait. */
                    if (!anyDown || Environment.TickCount - ButtonsUpDeadline >= 0) {
                        AwaitingButtonsUp = false;
                        Emit("BUTTONS_UP");
                    }
                }

                int armed = TriggerButton;
                if (armed != 0 && !TriggerHoldMode && ClickPressArmed && ClickInjectedButton == 0) {
                    long pressed = Environment.TickCount - DownAt;
                    bool overdue = pressed < 0 || pressed >= ClickHoldMs;
                    if (!overdue) {
                        POINT now;
                        if (GetCursorPos(out now)) {
                            long ddx = now.x - DownX;
                            long ddy = now.y - DownY;
                            long drag = ClickDragPx;
                            overdue = (ddx * ddx + ddy * ddy) >= drag * drag;
                        }
                    }
                    if (overdue) {
                        ClickInjectedButton = armed;
                        Passthroughs.Enqueue(PT_DOWN + armed);
                    }
                }
                int passthrough;
                while (Passthroughs.TryDequeue(out passthrough)) SendPassthrough(passthrough);
            };
            timer.Start();
            Emit("READY");
            Application.Run(context);
            timer.Stop();
            ReleaseInjectedButton();
            TriggerButton = 0;
            DisableBlocking();
            DrainOutbound();
        }
    }

    class Program {
        [STAThread]
        static void Main(string[] args) {
            try {
                RovylForeground.SetProcessWorkingSetSize(Process.GetCurrentProcess().Handle, (IntPtr)(-1), (IntPtr)(-1));
            } catch { }

            if (args.Length > 0 && args[0] == "mouse-blocker") {
                int parentPid = 0;
                if (args.Length > 1) int.TryParse(args[1], out parentPid);
                ZenithRadialMouseBlocker.Run(parentPid);
                return;
            }

            if (args.Length > 0 && args[0] == "foreground-focus") {
                RovylForegroundFocus.Run();
                return;
            }

            Console.WriteLine("Usage: rovyl-helper.exe [mouse-blocker <parentPid> | foreground-focus]");
        }
    }
}
