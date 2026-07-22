import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

/**
 * Standard admin empty-state. Centered card with an icon + friendly message,
 * rendered INSIDE the AdminShell content area so the layout stays visible when
 * a list has no rows.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title = "لا توجد بيانات حالياً",
  description,
}: {
  icon?: LucideIcon;
  title?: string;
  description?: string;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-border bg-card py-16 text-center">
      <Icon className="mx-auto h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
      <p className="mt-3 font-medium text-foreground">{title}</p>
      {description && (
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
