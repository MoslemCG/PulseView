# PulseView for Windows 11 x64

## Download and install

1. Download **PulseView-Setup-x64.exe** from the files below.
2. Open it and follow Setup. A Start menu shortcut is created; a desktop shortcut
   is optional. No build tools or GitHub knowledge are needed.
3. Launch **PulseView**. Its version appears in the footer and Help > About PulseView.

Setup installs for the current user and includes the Microsoft C++ runtime files.
If Microsoft WebView2 is missing, Setup uses Microsoft's signed bootstrapper to
install it; Internet access is needed for that step. Existing layouts and settings
under LocalAppData are preserved during upgrades and uninstall.

**PulseView-Portable-x64.zip** is the alternative: extract it, open the PulseView
folder and run PulseView.exe. Keep its ui folder and DLLs together. WebView2 is
still required. The Source code archives are for developers.

The PulseView installer is currently unsigned. SHA256SUMS.txt lists the file hashes.
Native build/unit checks and installer install/uninstall smoke checks run before
publication. GPU accuracy, multi-monitor DPI and overlay behavior still require
real-machine acceptance; this release does not certify all hardware.
