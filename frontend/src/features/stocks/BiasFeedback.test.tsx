import { afterEach, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BiasFeedback } from './BiasFeedback'

afterEach(() => window.localStorage.clear())

it('keeps the relevance feedback on this device only', async () => {
  render(<BiasFeedback personaId="robert" ticker="AAPL" />)

  const helpful = screen.getByRole('button', { name: 'Cette analyse était pertinente' })
  await userEvent.click(helpful)

  expect(helpful).toHaveAttribute('aria-pressed', 'true')
  expect(window.localStorage.getItem('stocklock:bias-feedback:robert:AAPL')).toBe('pertinent')
  expect(screen.getByText(/conservé uniquement sur cet appareil/)).toBeInTheDocument()
})
