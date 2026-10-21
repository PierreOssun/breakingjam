import { ArrowLeft, MapPin } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";
import { api, type Schemas } from "../api/client";
import { Button } from "../components/Button";
import { ShareButton } from "../components/ShareButton";
import { VideoDialog, type Video } from "../components/VideoDialog";
import { DancerActions } from "../features/dancers/DancerActions";
import { DancerAvatar } from "../features/dancers/DancerAvatar";
import { IdentityCard } from "../features/dancers/IdentityCard";
import { JamList } from "../features/dancers/JamList";
import { StatsStrip } from "../features/dancers/StatsStrip";
import { statsOf } from "../features/dancers/stats";
import { NotFoundPage } from "./NotFoundPage";

/** `/dancers/:id`: a dancer's record, upcoming and past jams (§6, DESIGN.md §6). */
export function DancerPage() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const page = useQuery({
    queryKey: ["dancer", id],
    queryFn: async () => {
      const { data, response } = await api.GET("/api/dancers/{id}", {
        params: { path: { id } },
      });
      // 400: not a uuid at all; either way there is no such dancer.
      if (response.status === 404 || response.status === 400) return null;
      if (!data) throw new Error(`GET /api/dancers/${id}: ${response.status}`);
      return data;
    },
  });

  if (page.isPending) return null;
  if (page.isError)
    return (
      <p className="mx-auto max-w-content px-4 py-10 text-danger">
        {t("errors.generic")}
      </p>
    );
  if (!page.data) return <NotFoundPage />;
  // §4 Merge: the old id answers with where the dancer lives now.
  if ("merged_into" in page.data)
    return <Navigate to={`/dancers/${page.data.merged_into}`} replace />;
  return <DancerDetail dancer={page.data} />;
}

function DancerDetail({ dancer }: { dancer: Schemas["DancerResponse"] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [video, setVideo] = useState<Video | null>(null);
  const events = useQuery({
    queryKey: ["dancer", dancer.id, "events"],
    queryFn: async () => {
      const { data, response } = await api.GET("/api/dancers/{id}/events", {
        params: { path: { id: dancer.id } },
      });
      if (!data) throw new Error(`dancer events: ${response.status}`);
      return data;
    },
  });
  const play = (p: Schemas["Participation"]) =>
    p.video_url &&
    setVideo({
      url: p.video_url,
      name: `${p.event.name}${p.battle ? ` — ${p.battle.name}` : ""}`,
    });

  return (
    <div className="mx-auto max-w-content px-4 md:px-6 lg:px-8">
      <title>{`${dancer.dancer_name} · BreakingJam`}</title>
      <div className="flex items-center justify-between py-2">
        {/* Back to the jam page that linked here; straight to the map when opened directly. */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            location.key === "default" ? navigate("/map") : navigate(-1)
          }
        >
          <ArrowLeft size={16} weight="bold" aria-hidden />
          {t("dancer.back")}
        </Button>
        <ShareButton title={dancer.dancer_name} />
      </div>

      <div className="flex flex-col gap-8 pb-10 lg:grid lg:grid-cols-[340px_1fr] lg:items-start lg:gap-12 lg:pb-20">
        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <IdentityCard
            name={dancer.dancer_name}
            verified={Boolean(dancer.verified_at)}
            flags={[dancer.country, dancer.country2]}
            aliases={dancer.aliases}
            instagram={dancer.instagram_handle}
            avatar={<DancerAvatar dancer={dancer} />}
          />
          {(dancer.crews.length > 0 || dancer.city) && (
            <div className="flex flex-wrap items-center gap-2">
              {dancer.crews.map((crew) => (
                // Crews have no page in v0.1 (§6), so the chip is not a link.
                <span
                  key={crew.id}
                  className="inline-flex h-9 items-center rounded-full border border-border-strong px-3.5 text-body-sm font-bold"
                >
                  {crew.name}
                </span>
              ))}
              {dancer.city && (
                <span className="inline-flex items-center gap-1.5 text-body-sm text-muted">
                  <MapPin size={16} weight="bold" aria-hidden />
                  {dancer.city}
                </span>
              )}
            </div>
          )}
          {dancer.bio && (
            <p className="text-body whitespace-pre-line">{dancer.bio}</p>
          )}
          <DancerActions dancer={dancer} />
          {events.data && (
            <StatsStrip
              stats={statsOf(events.data.past)}
              className="lg:grid-cols-2"
            />
          )}
        </aside>

        <div className="flex flex-col gap-10">
          <section className="flex flex-col gap-2">
            <h2 className="font-display text-display-sm lg:text-display-md">
              {t("dancer.upcoming")}
            </h2>
            {events.data && (
              <JamList
                items={events.data.upcoming}
                past={false}
                empty={t("dancer.noUpcoming")}
                onPlay={play}
              />
            )}
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="font-display text-display-sm lg:text-display-md">
              {t("dancer.past")}
            </h2>
            {events.data && (
              <JamList
                items={events.data.past}
                past
                empty={t("dancer.noPast")}
                onPlay={play}
              />
            )}
          </section>
        </div>
      </div>
      <VideoDialog video={video} onClose={() => setVideo(null)} />
    </div>
  );
}
