import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { useId, type PropsWithChildren } from "react";
import { FaCircleQuestion, FaXmark } from "react-icons/fa6";

interface HelpTipProps extends PropsWithChildren {
  title: string;
  className?: string;
}

export const HelpTip = ({ title, className = "", children }: HelpTipProps) => {
  const titleId = useId();

  return (
    <Popover className={`relative inline-flex ${className}`}>
      <PopoverButton
        type="button"
        aria-label={`Help: ${title}`}
        title={title}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-blue-700 hover:bg-blue-50 hover:text-blue-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        <FaCircleQuestion aria-hidden="true" className="h-4 w-4" />
      </PopoverButton>
      <PopoverPanel
        anchor="bottom start"
        transition
        className="z-[100] mt-2 w-72 origin-top-left rounded-lg border-2 border-blue-200 bg-white p-4 text-left text-sm font-normal leading-5 text-zinc-700 shadow-xl transition duration-150 ease-out [--anchor-gap:0.5rem] data-closed:scale-95 data-closed:opacity-0"
      >
        {({ close }) => (
          <>
            <span
              aria-hidden="true"
              className="absolute -top-[7px] left-4 h-3 w-3 rotate-45 border-l-2 border-t-2 border-blue-200 bg-white"
            />
            <div className="mb-2 flex items-start justify-between gap-3">
              <strong id={titleId} className="text-zinc-950">
                {title}
              </strong>
              <button
                type="button"
                aria-label="Close help"
                className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                onClick={() => close()}
              >
                <FaXmark aria-hidden="true" />
              </button>
            </div>
            <div aria-labelledby={titleId}>{children}</div>
          </>
        )}
      </PopoverPanel>
    </Popover>
  );
};
