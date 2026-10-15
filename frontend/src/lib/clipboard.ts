/** Copies text; false where the clipboard is unavailable (non-secure context) or refused. */
export async function copyText(text: string): Promise<boolean> {
  if (!navigator.clipboard) return false;
  return navigator.clipboard.writeText(text).then(
    () => true,
    () => false,
  );
}
