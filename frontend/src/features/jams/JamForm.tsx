import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import type { Schemas } from "../../api/client";
import { Button } from "../../components/Button";
import { CountrySelect } from "../../components/CountrySelect";
import { FormError } from "../../components/FormError";
import { OptionalLabel } from "../../components/OptionalLabel";
import { SelectField } from "../../components/SelectField";
import { TextAreaField } from "../../components/TextAreaField";
import { TextField } from "../../components/TextField";
import { applyFieldErrors } from "../../lib/apiErrors";
import { jamBody, type JamFormValues, timezones } from "./jamFields";
import { LocationField } from "./LocationField";

const FIELDS = [
  "name",
  "starts_on",
  "ends_on",
  "timezone",
  "venue_name",
  "address",
  "city",
  "country",
  "lat",
  "lng",
  "description",
  "registration_url",
  "instagram_url",
  "website_url",
  "contact_email",
] as const;

type JamFormProps = {
  initial: JamFormValues;
  submitLabel: string;
  /** Resolves with the API's error envelope, or nothing when saved. */
  onSubmit: (
    body: Schemas["EventFields"],
  ) => Promise<Schemas["ErrorEnvelope"] | undefined>;
};

/** A jam's details, for registering one and for editing it (§6 Forms). */
export function JamForm({ initial, submitLabel, onSubmit }: JamFormProps) {
  const { t } = useTranslation();
  const schema = useJamSchema();
  const form = useForm<JamFormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: initial,
  });
  const { register, handleSubmit, setError, setValue, watch } = form;
  const { errors, isSubmitting } = form.formState;
  const [address, city, country, lat, lng, description, timezone] = watch([
    "address",
    "city",
    "country",
    "lat",
    "lng",
    "description",
    "timezone",
  ]);

  const submit = handleSubmit(async (values) => {
    try {
      const failure = await onSubmit(jamBody(values));
      if (failure) applyFieldErrors(setError, failure, FIELDS);
    } catch {
      setError("root", { message: t("errors.generic") });
    }
  });
  const place = (value: { lng: number; lat: number } | null) => {
    setValue("lat", value?.lat ?? null, { shouldDirty: true });
    setValue("lng", value?.lng ?? null, { shouldDirty: true });
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      <TextField
        label={t("org.fields.name")}
        error={errors.name?.message}
        {...register("name")}
      />
      <div className="grid gap-6 sm:grid-cols-2">
        <TextField
          type="date"
          label={t("org.fields.startsOn")}
          error={errors.starts_on?.message}
          {...register("starts_on")}
        />
        <TextField
          type="date"
          label={t("org.fields.endsOn")}
          error={errors.ends_on?.message}
          {...register("ends_on")}
        />
      </div>
      <SelectField
        label={t("org.fields.timezone")}
        hint={t("org.fields.timezoneHint")}
        error={errors.timezone?.message}
        {...register("timezone")}
      >
        {timezones(timezone).map((zone) => (
          <option key={zone} value={zone}>
            {zone.replaceAll("_", " ")}
          </option>
        ))}
      </SelectField>
      <TextField
        label={<OptionalLabel label={t("org.fields.venue")} />}
        error={errors.venue_name?.message}
        {...register("venue_name")}
      />
      <TextField
        label={<OptionalLabel label={t("org.fields.address")} />}
        autoComplete="street-address"
        error={errors.address?.message}
        {...register("address")}
      />
      <div className="grid gap-6 sm:grid-cols-2">
        <TextField
          label={t("org.fields.city")}
          autoComplete="address-level2"
          error={errors.city?.message}
          {...register("city")}
        />
        <CountrySelect
          label={t("org.fields.country")}
          blank={t("org.fields.choose")}
          error={errors.country?.message}
          {...register("country")}
        />
      </div>
      <LocationField
        address={address}
        city={city}
        country={country}
        value={lat !== null && lng !== null ? { lat, lng } : null}
        onChange={place}
        onPlace={(found) => {
          if (!city.trim() && found.city) setValue("city", found.city);
          if (!country && found.country) setValue("country", found.country);
        }}
      />
      {(errors.lat ?? errors.lng) && (
        <p className="text-caption font-bold text-danger">
          {errors.lat?.message ?? errors.lng?.message}
        </p>
      )}
      <TextAreaField
        label={<OptionalLabel label={t("org.fields.description")} />}
        rows={3}
        counter={{ length: description.length, max: 200 }}
        error={errors.description?.message}
        {...register("description")}
      />
      <TextField
        type="url"
        label={<OptionalLabel label={t("org.fields.registrationUrl")} />}
        hint={t("org.fields.registrationUrlHint")}
        placeholder="https://"
        error={errors.registration_url?.message}
        {...register("registration_url")}
      />
      <TextField
        type="url"
        label={<OptionalLabel label={t("org.fields.instagramUrl")} />}
        placeholder="https://www.instagram.com/"
        error={errors.instagram_url?.message}
        {...register("instagram_url")}
      />
      <TextField
        type="url"
        label={<OptionalLabel label={t("org.fields.websiteUrl")} />}
        placeholder="https://"
        error={errors.website_url?.message}
        {...register("website_url")}
      />
      <TextField
        type="email"
        autoComplete="email"
        label={<OptionalLabel label={t("org.fields.contactEmail")} />}
        hint={t("org.fields.contactEmailHint")}
        error={errors.contact_email?.message}
        {...register("contact_email")}
      />
      <FormError message={errors.root?.message} />
      {/* §5: forms keep their action in a sticky bar on phones. */}
      <div className="sticky bottom-0 -mx-4 border-t border-border bg-bg px-4 py-3 md:-mx-6 md:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">
        <Button
          type="submit"
          className="w-full lg:w-auto"
          loading={isSubmitting}
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** Mirrors `EventFields` in the API; the server stays authoritative (§6 Forms). */
function useJamSchema() {
  const { t } = useTranslation();
  return useMemo(() => {
    const required = t("validation.required");
    const link = z
      .string()
      .trim()
      .max(500, t("validation.tooLong", { max: 500 }))
      .refine(
        (v) => v === "" || /^https?:\/\/\S+$/.test(v),
        t("validation.url"),
      );
    return z
      .object({
        name: z
          .string()
          .trim()
          .min(1, required)
          .max(200, t("validation.tooLong", { max: 200 })),
        starts_on: z.string().min(1, required),
        ends_on: z.string().min(1, required),
        timezone: z.string().min(1, required),
        venue_name: z.string().max(200, t("validation.tooLong", { max: 200 })),
        address: z.string().max(500, t("validation.tooLong", { max: 500 })),
        city: z
          .string()
          .trim()
          .min(1, required)
          .max(100, t("validation.tooLong", { max: 100 })),
        country: z.string().regex(/^[A-Z]{2}$/, required),
        lat: z.number().nullable(),
        lng: z.number().nullable(),
        description: z.string().max(200, t("validation.tooLong", { max: 200 })),
        registration_url: link,
        instagram_url: link,
        website_url: link,
        contact_email: z
          .string()
          .trim()
          .max(254, t("validation.tooLong", { max: 254 }))
          .refine(
            (v) => v === "" || z.email().safeParse(v).success,
            t("validation.email"),
          ),
      })
      .refine((v) => !v.starts_on || !v.ends_on || v.ends_on >= v.starts_on, {
        path: ["ends_on"],
        message: t("validation.endsBeforeStarts"),
      });
  }, [t]);
}
