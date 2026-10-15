import { useTranslation } from "react-i18next";

/** "Label optional", the §4.20 way: required fields never get an asterisk. */
export function OptionalLabel({ label }: { label: string }) {
  const { t } = useTranslation();
  return (
    <>
      {label}{" "}
      <span className="font-semibold tracking-normal text-muted normal-case">
        {t("form.optional")}
      </span>
    </>
  );
}
