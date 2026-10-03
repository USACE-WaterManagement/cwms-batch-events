import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseManualRecipients } from "./recipientParsing.ts";
import { sortOfficeCodes } from "./recipientOptions.ts";

describe("parseManualRecipients", () => {
  it("parses comma, semicolon, and newline-delimited addresses", () => {
    assert.deepEqual(
      parseManualRecipients(
        "one@example.mil, two@example.mil;\nthree@example.mil",
      ),
      {
        emails: [
          "one@example.mil",
          "two@example.mil",
          "three@example.mil",
        ],
        invalidFragments: [],
      },
    );
  });

  it("extracts and normalizes Outlook-style display-name addresses", () => {
    assert.deepEqual(
      parseManualRecipients(
        'Doe, Jane <Jane.Doe@Example.Mil>; "Smith, John" <john@example.mil>',
      ),
      {
        emails: ["jane.doe@example.mil", "john@example.mil"],
        invalidFragments: [],
      },
    );
  });

  it("removes angle brackets and deduplicates repeated addresses", () => {
    assert.deepEqual(
      parseManualRecipients("<alerts@example.mil> alerts@example.mil"),
      {
        emails: ["alerts@example.mil"],
        invalidFragments: [],
      },
    );
  });

  it("reports malformed address fragments while preserving valid addresses", () => {
    assert.deepEqual(
      parseManualRecipients("good@example.mil; bad@; second@example.com"),
      {
        emails: ["good@example.mil", "second@example.com"],
        invalidFragments: ["bad@"],
      },
    );
  });
});

describe("sortOfficeCodes", () => {
  it("sorts and deduplicates offices alphabetically", () => {
    assert.deepEqual(sortOfficeCodes(["SWT", "LRH", "MVP", "LRH", ""]), [
      "LRH",
      "MVP",
      "SWT",
    ]);
  });
});
