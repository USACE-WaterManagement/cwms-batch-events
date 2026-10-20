import { PropsWithChildren } from "react";

interface ViewLabelProps {
  children: React.ReactNode;
}

const ViewLabel = ({ children }: ViewLabelProps) => {
  return (
    <span className="select-none font-semibold text-base/6 text-slate-700 data-disabled:opacity-50 sm:text-sm/6">
      {children}
    </span>
  );
};

interface ViewFieldProps {
  label: React.ReactNode;
}

export const ViewField = ({
  label,
  children,
}: PropsWithChildren<ViewFieldProps>) => {
  return (
    <div className="script-view-field min-w-0 grid gap-1 [overflow-wrap:anywhere] @min-[30rem]/script-panel:grid-cols-[120px_minmax(0,1fr)] @min-[30rem]/script-panel:gap-6">
      <ViewLabel>{label}</ViewLabel>
      <div className="min-w-0">{children}</div>
    </div>
  );
};
