/** Palette / node icons (24×24 stroke paths), shared by simulation and balance-task mode. */

export const UNIT_ICONS = {
  feed: <path d="M3 5h11l6 7-6 7H3z" />,
  product: <path d="M4 6h11l6 6-6 6H4zM9 12h6" />,
  mixer: <path d="M5 4l14 8-14 8z" />,
  splitter: <path d="M2 12h8l10-7M10 12l10 7" />,
  heater: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M2 12h4l2-4 3 8 3-8 3 8 2-4h3" />
    </>
  ),
  cooler: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M2 12h4l2-4 3 8 3-8 3 8 2-4h3" />
    </>
  ),
  pump: (
    <>
      <circle cx="11" cy="13" r="7" />
      <path d="M11 6h9v3M8 13l6-3.5v7z" />
    </>
  ),
  valve: <path d="M3 7l18 10V7L3 17z" />,
  distillation: (
    <>
      <rect x="8" y="2" width="8" height="20" rx="4" />
      <path d="M8 8h5M16 12h-5M8 16h5" />
    </>
  ),
  flash: (
    <>
      <rect x="8" y="3" width="8" height="18" rx="4" />
      <path d="M8 9h8M3 13h5M12 3V1M12 21v2" />
    </>
  ),
  batch: (
    <>
      <path d="M4 13h12v4a6 5 0 0 1-12 0z" />
      <path d="M10 13V4h8v4M18 11v3" />
    </>
  ),
  evaporator: (
    <>
      <rect x="7" y="2" width="10" height="9" rx="4" />
      <rect x="8" y="11" width="8" height="10" />
    </>
  ),
  absorber: (
    <>
      <rect x="8" y="2" width="8" height="20" rx="4" />
      <path d="M9 8l6 6M15 8l-6 6" />
    </>
  ),
  extractor: (
    <>
      <rect x="8" y="2" width="8" height="20" rx="4" />
      <path d="M12 2v20M9 8h6M9 13h6M9 18h6" />
    </>
  ),
  evaptrain: (
    <>
      <rect x="2" y="6" width="6" height="12" rx="2" />
      <rect x="9" y="6" width="6" height="12" rx="2" />
      <rect x="16" y="6" width="6" height="12" rx="2" />
    </>
  ),
  crystallizer: (
    <>
      <path d="M5 4h14v11l-7 6-7-6z" />
      <path d="M9 12h2v2H9zM13 10h2v2h-2z" />
    </>
  ),
  dryer: (
    <>
      <path d="M3 8l18 3v5L3 13z" />
      <path d="M8 9v5M13 10v5" />
    </>
  ),
  unit: <rect x="4" y="5" width="16" height="14" rx="2" />,
} as const;
