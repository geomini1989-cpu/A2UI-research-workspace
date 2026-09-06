import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge className values with tailwind-merge, preserving Tailwind specificity. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
