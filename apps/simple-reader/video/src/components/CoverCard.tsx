import * as React from "react"
import { interpolate, useCurrentFrame } from "remotion"

import { EDITORIAL_PALETTE, SANS, SERIF } from "../fonts"

interface CoverCardProps {
  headline: string
  kicker?: string
  attribution?: string
  attributionRole?: string
  pullQuote?: string
  startFrame: number
  durationFrames: number
  fadeOutFrames?: number // default 20; pass more for smoother handoff to first clip
}

/**
 * Editorial magazine-style cover card for the opening segment.
 * Critical invariant: frame 0 is fully opaque — no fade-in — so this image
 * functions as the Shorts feed thumbnail and Channel grid tile.
 */
export const CoverCard: React.FC<CoverCardProps> = ({
  headline,
  kicker,
  attribution,
  attributionRole,
  pullQuote,
  startFrame,
  durationFrames,
  fadeOutFrames = 20,
}) => {
  const frame = useCurrentFrame()
  const localFrame = frame - startFrame

  if (localFrame < 0 || localFrame >= durationFrames) return null

  // No fade-in — fully opaque from frame 0. Only fade out at the end.
  // Clamp fadeOutFrames so very short covers (e.g. 1-frame poster) stay fully visible.
  const fo = Math.min(fadeOutFrames, durationFrames)
  const opacity = interpolate(localFrame, [durationFrames - fo, durationFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  // Headline auto-sizing by length (rough — viewer-readable on 320px Shorts thumb too)
  const wc = headline.trim().split(/\s+/).length
  const headlineSize = wc > 14 ? 104 : wc > 10 ? 118 : 138

  const ML = 90 // left margin — editorial flush-left grid

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: EDITORIAL_PALETTE.bg,
        opacity,
        zIndex: 100,
      }}
    >
      {/* Kicker — tiny caps label, top-left */}
      {kicker && (
        <div
          style={{
            position: "absolute",
            top: 150,
            left: ML,
            fontFamily: SANS,
            fontSize: 30,
            fontWeight: 700,
            color: EDITORIAL_PALETTE.kicker,
            letterSpacing: 6,
            textTransform: "uppercase",
          }}
        >
          {kicker}
        </div>
      )}

      {/* Red kicker rule */}
      {kicker && (
        <div
          style={{
            position: "absolute",
            top: 208,
            left: ML,
            width: 60,
            height: 3,
            backgroundColor: EDITORIAL_PALETTE.accent,
          }}
        />
      )}

      {/* Massive serif headline, flush-left */}
      <div
        style={{
          position: "absolute",
          top: 290,
          left: ML,
          right: ML,
          fontFamily: SERIF,
          fontWeight: 500,
          fontSize: headlineSize,
          color: EDITORIAL_PALETTE.cream,
          lineHeight: 1.04,
          letterSpacing: -0.5,
        }}
      >
        {headline}
      </div>

      {/* Attribution block — below headline, small sans */}
      {(attribution || attributionRole) && (
        <div
          style={{
            position: "absolute",
            top: 1180,
            left: ML,
          }}
        >
          {/* thin rule above attribution */}
          <div
            style={{
              width: 180,
              height: 2,
              backgroundColor: EDITORIAL_PALETTE.rule,
              marginBottom: 28,
            }}
          />
          {attribution && (
            <div
              style={{
                fontFamily: SANS,
                fontSize: 34,
                fontWeight: 700,
                color: EDITORIAL_PALETTE.cream,
                letterSpacing: 2,
              }}
            >
              {attribution}
            </div>
          )}
          {attributionRole && (
            <div
              style={{
                fontFamily: SANS,
                fontSize: 28,
                fontWeight: 400,
                color: EDITORIAL_PALETTE.dim,
                marginTop: 10,
              }}
            >
              {attributionRole}
            </div>
          )}
        </div>
      )}

      {/* Italic pull-quote with red vertical rule — bottom-left */}
      {pullQuote && (
        <div
          style={{
            position: "absolute",
            bottom: 220,
            left: ML,
            right: ML,
            display: "flex",
            alignItems: "flex-start",
            gap: 24,
          }}
        >
          <div
            style={{
              width: 4,
              minHeight: 100,
              backgroundColor: EDITORIAL_PALETTE.accent,
              flexShrink: 0,
              marginTop: 6,
            }}
          />
          <div
            style={{
              fontFamily: SERIF,
              fontStyle: "italic",
              fontSize: 48,
              fontWeight: 500,
              color: EDITORIAL_PALETTE.cream,
              lineHeight: 1.25,
            }}
          >
            {pullQuote}
          </div>
        </div>
      )}

      {/* Brand watermark — bottom-right, discreet */}
      <div
        style={{
          position: "absolute",
          bottom: 110,
          right: 90,
          fontFamily: SANS,
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: 2,
          color: EDITORIAL_PALETTE.dim,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>signalist</span>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 8,
            backgroundColor: EDITORIAL_PALETTE.accent,
            display: "inline-block",
          }}
        />
      </div>
    </div>
  )
}
