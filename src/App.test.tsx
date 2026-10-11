import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App shell', () => {
  it('starts on the Calendar tab', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Calendar')
    expect(screen.getByRole('button', { name: 'Calendar' })).toHaveAttribute('aria-current', 'page')
  })

  it('switches screens from the bottom tab bar', () => {
    render(<App />)
    for (const tab of ['Freezer', 'Meals', 'Settings', 'Calendar']) {
      fireEvent.click(screen.getByRole('button', { name: tab }))
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(tab)
      expect(screen.getByRole('button', { name: tab })).toHaveAttribute('aria-current', 'page')
    }
  })
})
