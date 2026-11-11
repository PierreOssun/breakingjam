import { useEffect, useRef } from "react";

/** A form's own error line, under its last field (§6 Forms); nothing when there is none. */
export function FormError({ message }: { message?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  // Under a long form's last field it is off-screen, and a failed save would look like nothing.
  useEffect(() => {
    if (message) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [message]);
  if (!message) return null;
  return (
    <p ref={ref} role="alert" className="text-body-sm font-bold text-danger">
      {message}
    </p>
  );
}
