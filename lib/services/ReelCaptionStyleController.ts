import { Caption, CaptionStyle } from "@/types";

export class ReelCaptionStyleController {
  /**
   * Apply style preset to caption
   */
  static applyPresetStyle(
    caption: Caption,
    preset: "default" | "bold" | "minimal" | "highlight"
  ): Caption {
    const presets: Record<string, Partial<CaptionStyle>> = {
      default: {
        fontSize: 48,
        fontFamily: "Arial",
        color: "#FFFFFF",
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        textAlign: "center",
      },
      bold: {
        fontSize: 56,
        fontFamily: "Arial",
        fontWeight: "bold",
        color: "#FFFFFF",
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        textAlign: "center",
        strokeColor: "#000000",
        strokeWidth: 2,
      },
      minimal: {
        fontSize: 42,
        fontFamily: "Arial",
        color: "#FFFFFF",
        backgroundColor: "transparent",
        textAlign: "center",
        strokeColor: "#000000",
        strokeWidth: 3,
      },
      highlight: {
        fontSize: 52,
        fontFamily: "Arial",
        color: "#000000",
        backgroundColor: "#FFFF00",
        textAlign: "center",
        fontWeight: "bold",
      },
    };

    return {
      ...caption,
      style: { ...caption.style, ...presets[preset] },
    };
  }

  /**
   * Update caption style
   */
  static updateStyle(caption: Caption, styleUpdates: Partial<CaptionStyle>): Caption {
    return {
      ...caption,
      style: { ...caption.style, ...styleUpdates },
    };
  }

  /**
   * Reset caption to default style
   */
  static resetToDefault(caption: Caption): Caption {
    return this.applyPresetStyle(caption, "default");
  }
}
