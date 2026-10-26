import { Trash, UploadSimple, WarningCircle } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type Schemas, unwrap } from "../../api/client";
import { Button } from "../../components/Button";
import { useToast } from "../../components/useToast";
import { FlyerCropDialog } from "./FlyerCropDialog";
import {
  ACCEPTED_TYPES,
  fileProblem,
  flyerImages,
  type Rect,
  tooSmall,
} from "./flyerCrop";

type Jam = Schemas["EventResponse"];
type Problem = "type" | "size" | "small" | "unreadable";

/** The jam's flyer in the editor: upload one, replace it, or go back to the generated one.
 * A new flyer shows at once; admins can remove it (decided in M19). */
export function FlyerEditor({ jam }: { jam: Jam }) {
  const { t } = useTranslation();
  const flyer = useFlyerUpload(jam);
  return (
    <section aria-labelledby="flyer-title" className="flex flex-col gap-4">
      <h2 id="flyer-title" className="font-display text-display-md">
        {t("org.flyer.title")}
      </h2>
      {flyer.input}
      {jam.flyer_card_url ? (
        <div className="flex items-start gap-4">
          <img
            src={jam.flyer_card_url}
            alt={t("org.flyer.current")}
            className="aspect-[4/5] w-[120px] shrink-0 rounded-md border border-border object-cover"
          />
          <div className="flex flex-col items-start gap-2">
            <FlyerButtons jam={jam} flyer={flyer} />
          </div>
        </div>
      ) : (
        <Dropzone flyer={flyer} />
      )}
      {flyer.problem ?? (
        <p className="text-caption text-muted">
          {t(jam.flyer_card_url ? "org.flyer.shown" : "org.flyer.generated")}
        </p>
      )}
      {flyer.dialog}
    </section>
  );
}

/** Under the flyer on the jam page, for whoever may edit the jam: the same flow as the editor. */
export function FlyerActions({ jam }: { jam: Jam }) {
  const flyer = useFlyerUpload(jam);
  return (
    <div className="flex flex-col gap-2">
      {flyer.input}
      <div className="flex flex-wrap items-center gap-2">
        <FlyerButtons jam={jam} flyer={flyer} />
      </div>
      {flyer.problem}
      {flyer.dialog}
    </div>
  );
}

type FlyerUpload = ReturnType<typeof useFlyerUpload>;

/** Upload (or replace) and, once there is an upload, remove. */
function FlyerButtons({ jam, flyer }: { jam: Jam; flyer: FlyerUpload }) {
  const { t } = useTranslation();
  const uploaded = Boolean(jam.flyer_card_url);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={flyer.choose}>
        <UploadSimple size={16} weight="bold" aria-hidden />
        {t(uploaded ? "org.flyer.replace" : "org.flyer.upload")}
      </Button>
      {uploaded && (
        <Button
          variant="ghost"
          size="sm"
          loading={flyer.removing}
          onClick={flyer.remove}
        >
          {!flyer.removing && <Trash size={16} weight="bold" aria-hidden />}
          {t("org.flyer.remove")}
        </Button>
      )}
    </>
  );
}

/** The editor's empty field: a dashed drop target that opens the file picker (DESIGN.md §4.28). */
function Dropzone({ flyer }: { flyer: FlyerUpload }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={flyer.choose}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void flyer.pick(e.dataTransfer.files[0]);
      }}
      className={`flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed bg-surface px-4 py-6 text-center transition-colors duration-fast hover:border-text ${flyer.problem ? "border-danger" : "border-border-strong"}`}
    >
      <UploadSimple
        size={28}
        weight="bold"
        aria-hidden
        className="text-primary-text"
      />
      <span className="text-body font-bold">{t("org.flyer.upload")}</span>
      <span className="text-caption text-muted">{t("org.flyer.formats")}</span>
    </button>
  );
}

/**
 * Picking, checking, cropping and uploading a flyer. The file input stays hidden: visible
 * buttons open it with `choose`. Renders nothing itself; callers place `input`, `problem`
 * (an alert, or null) and `dialog` (the crop dialog while a picked image waits).
 */
function useFlyerUpload(jam: Jam) {
  const { t } = useTranslation();
  const ref = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [picked, setPicked] = useState<HTMLImageElement | null>(null);
  const { upload, remove } = useFlyerMutations(jam);
  // The picked image's object URL lives as long as the crop dialog.
  useEffect(() => {
    return () => {
      if (picked) URL.revokeObjectURL(picked.src);
    };
  }, [picked]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const opened = await open(file);
    setProblem(typeof opened === "string" ? opened : null);
    if (typeof opened !== "string") setPicked(opened);
  };

  return {
    pick,
    choose: () => ref.current?.click(),
    remove: () => remove.mutate(),
    removing: remove.isPending,
    input: (
      <input
        ref={ref}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Picking the same file again must fire `change` again.
          e.target.value = "";
          void pick(file);
        }}
      />
    ),
    problem: problem && (
      <p
        role="alert"
        className="flex items-start gap-1.5 text-caption font-bold text-danger"
      >
        <WarningCircle
          size={14}
          weight="bold"
          aria-hidden
          className="mt-px shrink-0"
        />
        {t(`org.flyer.problem.${problem}`)}
      </p>
    ),
    dialog: picked && (
      <FlyerCropDialog
        image={picked}
        jam={jam}
        saving={upload.isPending}
        onCrop={(crop) =>
          upload.mutate(
            { image: picked, crop },
            { onSuccess: () => setPicked(null) },
          )
        }
        onClose={() => setPicked(null)}
      />
    ),
  };
}

/** The picked file as an image ready to crop, or why it can't be one. */
async function open(file: File): Promise<HTMLImageElement | Problem> {
  const early = fileProblem(file);
  if (early) return early;
  const image = new Image();
  image.src = URL.createObjectURL(file);
  const problem = await image.decode().then(
    () =>
      tooSmall({ width: image.naturalWidth, height: image.naturalHeight })
        ? "small"
        : null,
    () => "unreadable" as const,
  );
  if (!problem) return image;
  URL.revokeObjectURL(image.src);
  return problem;
}

/** Upload and remove, each updating the cached jam (by id for the editor, by slug for the jam
 * page) and the lists that show its flyer. */
function useFlyerMutations(jam: Jam) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const saved = (event: Schemas["Event"], message: string) => {
    for (const key of [jam.id, jam.slug]) {
      queryClient.setQueryData<Jam | null>(["event", key], (old) =>
        old ? { ...old, ...event } : old,
      );
    }
    void queryClient.invalidateQueries({ queryKey: ["events"] });
    toast({ kind: "success", message });
  };
  const failed = () => toast({ kind: "error", message: t("errors.generic") });
  const params = { path: { id: jam.id } };
  const upload = useMutation({
    mutationFn: async ({
      image,
      crop,
    }: {
      image: HTMLImageElement;
      crop: Rect;
    }) => {
      const { flyer, card } = await flyerImages(image, crop);
      const form = new FormData();
      form.append("flyer", flyer, "flyer.jpg");
      form.append("card", card, "card.jpg");
      const reply = await api.POST("/api/events/{id}/flyer", {
        params,
        // The generated type reads binary parts as strings; the form carries the JPEGs.
        body: form as unknown as Schemas["FlyerUpload"],
      });
      return unwrap(reply, "flyer");
    },
    onSuccess: (event) => saved(event, t("org.flyer.updated")),
    onError: failed,
  });
  const remove = useMutation({
    mutationFn: async () =>
      unwrap(await api.DELETE("/api/events/{id}/flyer", { params }), "flyer"),
    onSuccess: (event) => saved(event, t("org.flyer.removed")),
    onError: failed,
  });
  return { upload, remove };
}
