import * as React from "react"

import { cn } from "@/lib/utils"

// `min-h-11` por debajo de `lg`, igual que en `Button`: los 36px de `h-9` son
// la altura del handoff para un puntero y quedan por debajo del mínimo táctil
// de 44px. A partir de `lg` el mínimo se retira y el campo recupera su medida
// exacta, así que el diseño de escritorio no se mueve.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 min-h-11 lg:min-h-0 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
