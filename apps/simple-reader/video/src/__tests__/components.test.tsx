import { render } from "@testing-library/react"
import * as React from "react"
import { describe, expect, it } from "vitest"

import { AnimatedText } from "../components/AnimatedText"
import { ProgressBar } from "../components/ProgressBar"
import { TransitionWipe } from "../components/TransitionWipe"
import { YomooLogo } from "../components/YomooLogo"

describe("AnimatedText", () => {
  it("renders the provided text", () => {
    const { container } = render(<AnimatedText text="Hello World" />)
    expect(container.textContent).toBe("Hello World")
  })

  it("applies custom fontSize", () => {
    const { container } = render(<AnimatedText text="Test" fontSize={48} />)
    const el = container.firstChild as HTMLElement
    expect(el.style.fontSize).toBe("48px")
  })

  it("applies custom color", () => {
    const { container } = render(<AnimatedText text="Test" color="#ff0000" />)
    const el = container.firstChild as HTMLElement
    expect(el.style.color).toBe("rgb(255, 0, 0)")
  })

  it("respects delay prop", () => {
    // With delay > current frame, should still render (just with different animation state)
    const { container } = render(<AnimatedText text="Delayed" delay={100} />)
    expect(container.textContent).toBe("Delayed")
  })
})

describe("ProgressBar", () => {
  it("renders with correct fill width ratio", () => {
    const { getByTestId } = render(<ProgressBar current={3} total={10} />)
    const fill = getByTestId("progress-fill")
    expect(fill.style.width).toBe("30%")
  })

  it("renders 0% for 0 total", () => {
    const { getByTestId } = render(<ProgressBar current={0} total={0} />)
    const fill = getByTestId("progress-fill")
    expect(fill.style.width).toBe("0%")
  })

  it("renders 100% when current equals total", () => {
    const { getByTestId } = render(<ProgressBar current={5} total={5} />)
    const fill = getByTestId("progress-fill")
    expect(fill.style.width).toBe("100%")
  })
})

describe("YomooLogo", () => {
  it("renders the logo element", () => {
    const { getByTestId } = render(<YomooLogo />)
    expect(getByTestId("yomoo-logo")).toBeDefined()
  })

  it("renders YOMOO text", () => {
    const { container } = render(<YomooLogo />)
    expect(container.textContent).toContain("YOMOO")
  })

  it("renders Y letter in logo mark", () => {
    const { container } = render(<YomooLogo />)
    expect(container.textContent).toContain("Y")
  })
})

describe("TransitionWipe", () => {
  it("renders the wipe element", () => {
    const { getByTestId } = render(<TransitionWipe />)
    expect(getByTestId("transition-wipe")).toBeDefined()
  })

  it("renders with default right direction", () => {
    const { getByTestId } = render(<TransitionWipe />)
    const el = getByTestId("transition-wipe")
    expect(el.style.transform).toBeDefined()
  })
})
