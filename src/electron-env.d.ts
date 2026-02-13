export {}

declare global {
  interface Window {
    electron: {
      onWindowUpdate: (callback: (data: any) => void) => void;
      setIgnoreMouseEvents: (ignore: boolean, options?: any) => void;
      startDrag: () => void;
      endDrag: () => void;
    };
  }
}