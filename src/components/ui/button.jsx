import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"
import { useLuxeRipple } from "@/hooks/use-luxe-ripple"

// Every variant opts into the global `.btn-luxe` styling (glassmorphic
// surface + smooth click depression + ripple), then layers its own tint
// on top via the matching `.btn-luxe-*` modifier.
const buttonVariants = cva(
  "btn-luxe inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium focus-visible:outline-none disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "btn-luxe-info",
        destructive: "btn-luxe-danger",
        outline: "btn-luxe-neutral",
        secondary: "btn-luxe-neutral",
        ghost: "btn-luxe-neutral !bg-transparent !border-transparent !shadow-none hover:!bg-white/5 hover:!border-white/10",
        link: "!bg-transparent !border-transparent !shadow-none text-primary underline-offset-4 hover:underline",
        success: "btn-luxe-success",
      },
      size: {
        default: "h-9 px-4 py-2 rounded-xl",
        sm: "h-8 px-3 text-xs rounded-lg",
        lg: "h-11 px-8 rounded-2xl text-sm",
        icon: "h-10 w-10 btn-luxe-round",
        pill: "h-10 px-6 btn-luxe-pill",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, onClick, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  const emitRipple = useLuxeRipple()

  const handleClick = (e) => {
    emitRipple(e)
    onClick?.(e)
  }

  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      onClick={handleClick}
      {...props}
    />
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
