import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom's Blob doesn't survive fake-indexeddb's structuredClone (it comes
// back as `{}`); Node's does, like a real browser's. Imported by name so the
// app's tsconfig doesn't need Node types.
const nodeBuffer = 'node:buffer'
const { Blob, File } = (await import(/* @vite-ignore */ nodeBuffer)) as Pick<typeof globalThis, 'Blob' | 'File'>
Object.assign(globalThis, { Blob, File })

afterEach(cleanup)
