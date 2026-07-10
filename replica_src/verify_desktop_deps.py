from pathlib import Path


WEBVIEW2_CANDIDATES = [
    Path(r"C:\Program Files (x86)\Microsoft\EdgeWebView\Application"),
    Path(r"C:\Program Files\Microsoft\EdgeWebView\Application"),
    Path(r"C:\Windows\System32\Microsoft-Edge-WebView"),
]


def main() -> None:
    import clr_loader
    import pythonnet
    import webview
    import webview.platforms.winforms

    print(f"webview: {webview.__file__}")
    print(f"pythonnet: {pythonnet.__file__}")
    print(f"clr_loader: {clr_loader.__file__}")
    if not any(path.exists() for path in WEBVIEW2_CANDIDATES):
        raise RuntimeError("Microsoft Edge WebView2 runtime was not found")
    print("winforms platform import ok")
    print("webview2 runtime found")
    print("desktop dependency verification ok")


if __name__ == "__main__":
    main()
