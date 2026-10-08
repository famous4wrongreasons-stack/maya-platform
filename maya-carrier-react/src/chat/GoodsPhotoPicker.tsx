import type { Tokens } from '../identity/tokens.ts';

/** One ephemeral file gesture. The headless port owns validation, upload and cancellation. */
export function GoodsPhotoPicker({ disabled, select, t }: {
  readonly disabled: boolean;
  readonly select: (photo: File) => void;
  readonly t: Tokens;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8, color: t.ink, fontSize: 14 }}>
      Фото накладной или заказ-наряда
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={disabled}
        onChange={(event) => {
          const photo = event.currentTarget.files?.item(0);
          // Do not keep the filename or FileList in the mounted DOM after the gesture.
          event.currentTarget.value = '';
          if (!disabled && photo) select(photo);
        }}
        style={{ maxWidth: '100%', font: 'inherit', color: t.ink }}
      />
      <span style={{ fontSize: 12, lineHeight: '18px' }}>Один файл PNG, JPEG или WebP, до 2 МиБ. Фото не сохраняется.</span>
    </label>
  );
}
