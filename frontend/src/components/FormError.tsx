/** A form's own error line, under its last field (§6 Forms); nothing when there is none. */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-body-sm font-bold text-danger">
      {message}
    </p>
  );
}
