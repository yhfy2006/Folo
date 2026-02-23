import * as React from "react"
import { useVideoConfig } from "remotion"

import { AnimatedText } from "../components/AnimatedText"
import { YomooLogo } from "../components/YomooLogo"
import { colors, fonts, spacing } from "../styles/theme"
import type { OutroScene } from "../types"

interface OutroProps {
  scene: OutroScene
}

export const Outro: React.FC<OutroProps> = ({ scene: _scene }) => {
  const { fps } = useVideoConfig()

  return (
    <div
      data-testid="outro"
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: colors.background,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <YomooLogo size={80} />

      <AnimatedText
        text="感谢收看"
        delay={Math.round(fps * 0.5)}
        fontSize={48}
        color={colors.text}
        fontFamily={fonts.body}
        fontWeight={700}
        style={{ marginTop: spacing.lg }}
      />

      <AnimatedText
        text="点赞 · 订阅 · 开启通知"
        delay={Math.round(fps * 1.2)}
        fontSize={32}
        color={colors.secondary}
        fontFamily={fonts.body}
        fontWeight={600}
        style={{ marginTop: spacing.md }}
      />

      <AnimatedText
        text="明天见 👋"
        delay={Math.round(fps * 2)}
        fontSize={36}
        color={colors.primary}
        fontFamily={fonts.body}
        fontWeight={600}
        style={{ marginTop: spacing.xl }}
      />

      <AnimatedText
        text="daily.yomoo.net/subscribe"
        delay={Math.round(fps * 2.8)}
        fontSize={22}
        color={colors.muted}
        fontFamily={fonts.body}
        style={{ marginTop: spacing.lg }}
      />
    </div>
  )
}
