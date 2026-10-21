import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { useToast } from "../../components/useToast";
import { ClaimError, type ClaimKind, useClaim, useOpenClaim } from "./claims";
import { PendingPill } from "./PendingPill";
import { VerifyDialog } from "./VerifyDialog";

type VerifyButtonProps = {
  kind: ClaimKind;
  id: string;
  /** Whether a claim can be opened now; the latest one is only fetched then. */
  enabled: boolean;
  /** The page's current handle: an organiser's pending claim counts only for that one. */
  handle?: string | null;
  label: string;
  /** What a 409 means here; the generic message otherwise. */
  conflict?: string;
};

/**
 * The verify step by state (DESIGN.md §6): the button that opens a claim and shows its
 * code, or the pending pill while one waits for review.
 */
export function VerifyButton({
  kind,
  id,
  enabled,
  handle,
  label,
  conflict,
}: VerifyButtonProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const claim = useClaim(kind, id, enabled);
  const openClaim = useOpenClaim(kind, id);
  const [verifying, setVerifying] = useState(false);

  const latest = claim.data;
  const pending =
    latest?.status === "pending" &&
    (!("instagram_handle" in latest) || latest.instagram_handle === handle)
      ? latest
      : null;
  const verify = () =>
    openClaim.mutate(undefined, {
      onSuccess: () => setVerifying(true),
      onError: (error) =>
        toast({
          kind: "error",
          message:
            conflict && error instanceof ClaimError && error.status === 409
              ? conflict
              : t("errors.generic"),
        }),
    });

  return (
    <>
      {pending ? (
        <PendingPill code={pending.code} />
      ) : (
        enabled &&
        claim.isSuccess && (
          <Button
            variant="secondary"
            className="w-full"
            loading={openClaim.isPending}
            onClick={verify}
          >
            {label}
          </Button>
        )
      )}
      {verifying && (
        <VerifyDialog
          claim={openClaim.data ?? claim.data ?? null}
          onClose={() => setVerifying(false)}
        />
      )}
    </>
  );
}
