import { useState } from "react";
import { Button, Dropdown } from "@usace/groundwork";
import { MdAdd, MdClose } from "react-icons/md";

type RoleMultiSelectProps = {
  allRoles: string[];
  initialSelectedRoles?: string[];
  onChange?: (selectedRoles: string[]) => void;
};

export const RoleMultiSelect = ({
  allRoles,
  initialSelectedRoles = [],
  onChange,
}: RoleMultiSelectProps) => {
  const [selectedRoles, setSelectedRoles] =
    useState<string[]>(initialSelectedRoles);
  const [pendingRole, setPendingRole] = useState("");

  const addRole = (addedRole: string) => {
    if (!selectedRoles.includes(addedRole)) {
      const updated = [...selectedRoles, addedRole];
      setSelectedRoles(updated);
      onChange?.(updated);
    }
  };

  const removeRole = (removedRole: string) => {
    const updated = selectedRoles.filter((role) => role !== removedRole);
    setSelectedRoles(updated);
    setPendingRole("");
    onChange?.(updated);
  };

  const availableRoles = allRoles.filter((r) => !selectedRoles.includes(r));

  return (
    <div className="min-w-0 space-y-2">
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600">
          <span>Selected roles</span>
          <span>{selectedRoles.length}</span>
        </div>
        <div role="region" aria-label="Selected roles" tabIndex={0}
          className="max-h-32 overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:-outline-offset-2">
          {selectedRoles.length === 0 ? (
        <p className="px-3 py-3 text-sm text-gray-500">No additional CDA role required. Office access is required.</p>
          ) : <ul className="divide-y divide-gray-100">
            {selectedRoles.map((role) => (
              <li key={role} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <span title={role} className="min-w-0 truncate text-sm">{role}</span>
                <button type="button" aria-label={`Remove ${role}`} title={`Remove ${role}`}
                  onClick={() => removeRole(role)}
                  className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded text-gray-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-blue-600">
                  <MdClose aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ul>}
        </div>
        {availableRoles.length > 0 && (
          <div className="flex items-center gap-3 border-t border-gray-200 bg-gray-50 p-3 [&>div]:min-w-0 [&>div]:flex-1 [&_select]:mt-0! [&_button]:inline-flex [&_button]:shrink-0 [&_button]:items-center [&_button]:gap-1">
            <div>
              <Dropdown
                key={selectedRoles.join("\u0000")}
                id="roles"
                aria-label="Role to add"
                className="truncate"
                title={pendingRole || "Choose a role"}
                onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setPendingRole(event.target.value)}
                options={[
                  <option key="placeholder" value="">Choose a role</option>,
                  ...availableRoles.map(role => <option key={role} value={role}>{role}</option>),
                ]}
              />
            </div>
            <Button type="button" aria-label="Add role" disabled={!pendingRole}
              onClick={() => { addRole(pendingRole); setPendingRole(""); }}>
              <MdAdd aria-hidden /> Add
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
