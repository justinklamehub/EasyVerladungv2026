import { useEffect } from "react";

export const CUSTOM_DESIGN_VAR_MAP: Record<string, string> = {
  buttonBg: "--custom-button-bg",
  buttonFg: "--custom-button-fg",
  buttonRadius: "--custom-button-radius",
  tableHeaderBg: "--custom-table-header-bg",
  tableHeaderFg: "--custom-table-header-fg",
  tableRowHover: "--custom-table-row-hover-bg",
  tableRowStripe: "--custom-table-row-stripe-bg",
  filterBg: "--custom-filter-bg",
  filterBorder: "--custom-filter-border",
  filterRadius: "--custom-filter-radius",
  cardBg: "--custom-card-bg",
  cardBorder: "--custom-card-border",
  cardRadius: "--custom-card-radius",
};

export function useCustomDesign(customDesignJson?: string | null) {
  useEffect(() => {
    const root = document.documentElement;
    let parsed: Record<string, string> = {};
    if (customDesignJson) {
      try {
        parsed = JSON.parse(customDesignJson);
      } catch {
        parsed = {};
      }
    }
    for (const [key, cssVar] of Object.entries(CUSTOM_DESIGN_VAR_MAP)) {
      const val = parsed[key];
      if (val && val.trim() !== "") {
        root.style.setProperty(cssVar, val);
      } else {
        root.style.removeProperty(cssVar);
      }
    }
  }, [customDesignJson]);
}
