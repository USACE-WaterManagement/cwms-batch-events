import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Search,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  Textarea,
} from "@usace/groundwork";
import {
  FaArrowUpRightFromSquare,
  FaCheck,
  FaPlus,
  FaXmark,
} from "react-icons/fa6";
import { HelpTip } from "../../shared/components/HelpTip";
import { useCdaUserLists } from "./api";
import { parseManualRecipients } from "./recipientParsing";
import { sortOfficeCodes } from "./recipientOptions";

type AddRecipientMode = "manual" | "user-list";

interface RecipientEditorProps {
  office: string;
  availableOffices: string[];
  cdaUserListId: string;
  cdaUserListOffice: string;
  manualRecipients: string[];
  onCdaUserListChange: (office: string, userListId: string) => void;
  onManualRecipientsChange: (recipients: string[]) => void;
}

export const RecipientEditor = ({
  office,
  availableOffices,
  cdaUserListId,
  cdaUserListOffice,
  manualRecipients,
  onCdaUserListChange,
  onManualRecipientsChange,
}: RecipientEditorProps) => {
  const cdaUserListsUrl =
    import.meta.env.VITE_CDA_USER_LISTS_URL ??
    (import.meta.env.DEV
      ? "http://localhost:5174/cwms-data/user-lists"
      : "");
  const [addMode, setAddMode] = useState<AddRecipientMode | null>(null);
  const [manualEmail, setManualEmail] = useState("");
  const [manualError, setManualError] = useState("");
  const [userListSearch, setUserListSearch] = useState("");
  const [debouncedUserListSearch, setDebouncedUserListSearch] = useState("");
  const [userListOffice, setUserListOffice] = useState(
    cdaUserListOffice || office,
  );
  const userLists = useCdaUserLists(
    addMode === "user-list" ? userListOffice : undefined,
  );

  useEffect(() => {
    if (addMode === "user-list") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset the picker when its recipient context changes.
      setUserListOffice(cdaUserListOffice || office);
    }
  }, [addMode, cdaUserListOffice, office]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedUserListSearch(userListSearch.trim()),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [userListSearch]);

  const selectedUserList = userLists.data?.find(
    (list) =>
      userListOffice === cdaUserListOffice &&
      list["user-list-id"] === cdaUserListId,
  );

  const orderedAvailableOffices = sortOfficeCodes([
    ...availableOffices,
    userListOffice,
  ]);

  const filteredUserLists = useMemo(() => {
    const search = debouncedUserListSearch.toLocaleLowerCase();
    const matches = search
      ? (userLists.data ?? []).filter((list) =>
          `${list["user-list-id"]} ${list.description ?? ""}`
            .toLocaleLowerCase()
            .includes(search),
        )
      : (userLists.data ?? []);
    return matches.slice(0, search ? 20 : 5);
  }, [debouncedUserListSearch, userLists.data]);

  const addManualRecipient = () => {
    const parsed = parseManualRecipients(manualEmail);
    if (parsed.emails.length === 0) {
      setManualError("Enter at least one valid email address.");
      return;
    }
    if (parsed.invalidFragments.length > 0) {
      setManualError(
        `Correct the malformed address${parsed.invalidFragments.length === 1 ? "" : "es"}: ${parsed.invalidFragments.join(", ")}`,
      );
      return;
    }
    const newRecipients = parsed.emails.filter(
      (email) => !manualRecipients.includes(email),
    );
    if (newRecipients.length === 0) {
      setManualError("Those email addresses are already included.");
      return;
    }
    onManualRecipientsChange([...manualRecipients, ...newRecipients]);
    setManualEmail("");
    setManualError("");
  };

  const chooseUserList = (userListId: string) => {
    onCdaUserListChange(userListOffice, userListId);
    setAddMode(null);
    setUserListSearch("");
    setDebouncedUserListSearch("");
  };

  return (
    <section className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1">
            <Text className="font-semibold text-zinc-950">Recipients</Text>
            <HelpTip title="Email recipients">
              Add individual email addresses or one office-scoped CDA user list.
              List membership is resolved by CDA each time an email is sent.
            </HelpTip>
          </div>
          <Text className="text-sm text-zinc-600">
            {manualRecipients.length + (cdaUserListId ? 1 : 0)} recipient
            {manualRecipients.length + (cdaUserListId ? 1 : 0) === 1
              ? " source"
              : " sources"}
          </Text>
        </div>
        <Button
          type="button"
          color="light"
          onClick={() => setAddMode((current) => current ?? "manual")}
        >
          <FaPlus aria-hidden="true" />
          Add recipient
        </Button>
      </div>

      <div className="max-h-56 overflow-auto rounded-lg border border-zinc-200">
        <Table className="min-w-full">
          <TableHead className="sticky top-0 z-10 bg-zinc-50">
            <TableRow>
              <TableHeader>Type</TableHeader>
              <TableHeader>Recipient</TableHeader>
              <TableHeader>
                <span className="sr-only">Actions</span>
              </TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {cdaUserListId && (
              <TableRow>
                <TableCell>
                  <Badge color="blue">CDA list</Badge>
                </TableCell>
                <TableCell>
                  <span className="font-medium">
                    {cdaUserListOffice} / {cdaUserListId}
                  </span>
                  {selectedUserList?.description && (
                    <span className="ml-2 text-sm text-zinc-600">
                      {selectedUserList.description}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    color="danger"
                    style="outline"
                    aria-label={`Remove CDA user list ${cdaUserListId}`}
                    onClick={() => onCdaUserListChange("", "")}
                  >
                    <FaXmark aria-hidden="true" />
                  </Button>
                </TableCell>
              </TableRow>
            )}
            {manualRecipients.map((email) => (
              <TableRow key={email}>
                <TableCell>
                  <Badge color="zinc">Email</Badge>
                </TableCell>
                <TableCell>{email}</TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    color="danger"
                    style="outline"
                    aria-label={`Remove manual recipient ${email}`}
                    onClick={() =>
                      onManualRecipientsChange(
                        manualRecipients.filter((item) => item !== email),
                      )
                    }
                  >
                    <FaXmark aria-hidden="true" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!cdaUserListId && manualRecipients.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-6 text-center">
                  <Text className="text-zinc-600">
                    No recipients added yet.
                  </Text>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {addMode && (
        <div className="grid gap-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2" aria-label="Recipient type">
              <Button
                type="button"
                color={addMode === "manual" ? "blue" : "light"}
                onClick={() => setAddMode("manual")}
              >
                Manual email
              </Button>
              <Button
                type="button"
                color={addMode === "user-list" ? "blue" : "light"}
                onClick={() => setAddMode("user-list")}
              >
                CDA user list
              </Button>
            </div>
            <Button
              type="button"
              color="light"
              aria-label="Close add recipient"
              onClick={() => {
                setAddMode(null);
                setManualError("");
              }}
            >
              <FaXmark aria-hidden="true" />
            </Button>
          </div>

          {addMode === "manual" ? (
            <div className="grid gap-2">
              <label
                htmlFor="manual-recipient-email"
                className="font-medium text-zinc-950"
              >
                Email addresses
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Textarea
                  id="manual-recipient-email"
                  value={manualEmail}
                  placeholder="name@example.mil; Another Person <another@example.mil>"
                  aria-invalid={!!manualError}
                  rows={3}
                  onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => {
                    setManualEmail(event.target.value);
                    setManualError("");
                  }}
                />
                <Button type="button" onClick={addManualRecipient}>
                  Add emails
                </Button>
              </div>
              <Text className="text-sm text-zinc-600">
                Paste addresses separated by commas, semicolons, or new lines.
                Outlook-style names and angle brackets are supported.
              </Text>
              {manualError && (
                <Text role="alert" className="text-red-700">
                  {manualError}
                </Text>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              <label
                htmlFor="cda-user-list-office"
                className="font-medium text-zinc-950"
              >
                User list office
              </label>
              <select
                id="cda-user-list-office"
                name="cda-user-list-office"
                className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-950 shadow-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={userListOffice}
                onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                  setUserListOffice(event.target.value);
                  setUserListSearch("");
                  setDebouncedUserListSearch("");
                }}
              >
                {orderedAvailableOffices.map((availableOffice) => (
                  <option key={availableOffice} value={availableOffice}>
                    {availableOffice}
                  </option>
                ))}
              </select>
              <label
                htmlFor="cda-user-list-search"
                className="font-medium text-zinc-950"
              >
                Find a CDA user list
              </label>
              <div className="-m-2 pr-4">
                <Search
                  id="cda-user-list-search"
                  value={userListSearch}
                  placeholder="Search list name or description"
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setUserListSearch(event.target.value)
                  }
                />
              </div>
              {cdaUserListId && (
                <Text className="rounded-md border border-blue-100 bg-white px-3 py-2 text-sm text-zinc-700">
                  Choosing a different list replaces {cdaUserListId}.
                </Text>
              )}
              {userLists.isLoading ? (
                <Text role="status">Loading CDA user lists…</Text>
              ) : userLists.error ? (
                <Text role="alert" className="text-red-700">
                  {userLists.error.message}
                </Text>
              ) : filteredUserLists.length > 0 ? (
                <div className="grid gap-2">
                  <Text className="text-sm text-zinc-600">
                    Showing {filteredUserLists.length} of{" "}
                    {userLists.data?.length ?? 0} lists
                    {!debouncedUserListSearch &&
                    (userLists.data?.length ?? 0) > filteredUserLists.length
                      ? ". Search to find more."
                      : "."}
                  </Text>
                  <div className="rounded-lg border border-zinc-300 bg-white shadow-sm">
                    <Table className="max-h-64 overflow-y-auto">
                      <TableHead>
                        <TableRow>
                          <TableHeader className="sticky top-0 z-20 bg-zinc-100 shadow-[inset_0_-1px_0_#d4d4d8]">
                            User list
                          </TableHeader>
                          <TableHeader className="sticky top-0 z-20 w-24 bg-zinc-100 text-right shadow-[inset_0_-1px_0_#d4d4d8]">
                            Action
                          </TableHeader>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {filteredUserLists.map((list) => {
                          const isSelected =
                            list["user-list-id"] === cdaUserListId;
                          return (
                            <TableRow
                              key={list["user-list-id"]}
                              aria-current={isSelected ? "true" : undefined}
                            >
                              <TableCell
                                className={`whitespace-normal align-top ${
                                  isSelected
                                    ? "border-l-4 border-blue-700 bg-blue-100"
                                    : "border-l-4 border-transparent"
                                }`}
                              >
                                <span className="block break-words font-medium text-zinc-950">
                                  {list["user-list-id"]}
                                </span>
                                {list.description && (
                                  <span className="mt-1 block break-words text-sm text-zinc-600">
                                    {list.description}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell
                                className={`align-middle text-right ${
                                  isSelected ? "bg-blue-100" : ""
                                }`}
                              >
                                {isSelected ? (
                                  <Badge color="blue">
                                    <FaCheck aria-hidden="true" /> Selected
                                  </Badge>
                                ) : (
                                  <Button
                                    type="button"
                                    color="light"
                                    aria-label={`Select CDA user list ${list["user-list-id"]}`}
                                    onClick={() =>
                                      chooseUserList(list["user-list-id"])
                                    }
                                  >
                                    Select
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <Text>
                  {(userLists.data?.length ?? 0) === 0
                    ? `No CDA user lists exist for ${userListOffice}.`
                    : "No user lists match that search."}
                </Text>
              )}
              {cdaUserListsUrl && (
                <div className="border-t border-blue-200 pt-3">
                  <a
                    className="inline-flex items-center gap-2 rounded-md border border-blue-700 bg-white px-4 py-2 font-semibold text-blue-700 shadow-sm hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                    href={cdaUserListsUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Manage user lists in CDA
                    <FaArrowUpRightFromSquare aria-hidden="true" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  <Text className="mt-2 text-sm text-zinc-600">
                    Create or update recipient lists in CWMS Data API.
                  </Text>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
