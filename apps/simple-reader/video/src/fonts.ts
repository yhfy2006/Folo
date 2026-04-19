import {
  loadFont as loadBodoni,
  loadFont as loadBodoniItalic,
} from "@remotion/google-fonts/LibreBodoni"
import { loadFont as loadPublicSans } from "@remotion/google-fonts/PublicSans"

loadBodoni("normal", { weights: ["400", "500", "700"], subsets: ["latin"] })
loadBodoniItalic("italic", { weights: ["400", "500", "700"], subsets: ["latin"] })
loadPublicSans("normal", { weights: ["400", "500", "700"], subsets: ["latin"] })

export const SERIF = "'Libre Bodoni', 'New York', Georgia, serif"
export const SANS = "'Public Sans', 'Inter', 'Helvetica Neue', sans-serif"

export const EDITORIAL_PALETTE = {
  bg: "#0E0E0E",
  cream: "#F5F0E8",
  dim: "#A09B91",
  kicker: "#C6A867",
  accent: "#C82A36",
  rule: "#5A554E",
  goldWarm: "#E8C45C",
} as const
