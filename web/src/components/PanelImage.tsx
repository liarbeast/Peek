import { Spinner } from "@heroui/react";
import { useEffect, useState } from "react";
import { isPortrait } from "../api";
import { useSettings } from "../settings";

interface Props {
  // Loads the image; called again whenever `deps` change.
  load: () => Promise<Blob>;
  deps: unknown[];
  alt: string;
}

// A render of what the panel shows (800x480, or 480x800 when the frame hangs
// in portrait), with a spinner while it renders.
export function PanelImage({ load, deps, alt }: Props) {
  const { orientation } = useSettings();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .then((blob) => {
        if (cancelled) return;
        setError(null);
        setUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, orientation]);

  return (
    <div
      className={`relative mx-auto overflow-hidden rounded-lg border border-border bg-surface-secondary ${
        isPortrait(orientation) ? "aspect-[3/5] w-full max-w-[min(100%,calc(70vh*0.6))]" : "aspect-[5/3] w-full"
      }`}
    >
      {url && <img src={url} alt={alt} className="h-full w-full object-contain" />}
      {error && (
        <p className="absolute inset-0 flex items-center justify-center bg-background/90 p-4 text-center text-sm text-danger">
          {error}
        </p>
      )}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/40">
          <Spinner />
        </div>
      )}
    </div>
  );
}
