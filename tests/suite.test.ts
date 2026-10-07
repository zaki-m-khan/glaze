import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SuiteError } from "@/lib/errors";
import { buildInputs, loadSuite } from "@/lib/suite";
import { tempDir } from "./helpers";

describe("loadSuite", () => {
  it("loads every committed suite and builds one row per golden company", () => {
    for (const name of ["tech-stack", "traffic", "funding"]) {
      const suite = loadSuite(`suites/${name}.yaml`);
      expect(suite.rowList).toHaveLength(20);
      expect(suite.function.routineId).toMatch(/^function:t_/);
      expect(Object.values(suite.rowList[0]!.inputs)).toEqual(["clay.com"]);
    }
  });

  it("never references the Work Email function", () => {
    for (const name of ["tech-stack", "traffic", "funding"]) {
      expect(loadSuite(`suites/${name}.yaml`).function.routineId).not.toContain("t_0tj9gb2bxScEdAV3dK6");
    }
  });

  it("reports every schema problem with its path", () => {
    const dir = tempDir();
    const file = join(dir, "bad.yaml");
    writeFileSync(file, "name: Bad Name\ntitle: x\n");
    const error = (() => {
      try {
        loadSuite(file);
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(SuiteError);
    expect(String((error as Error).message)).toMatch(/name: suite names are kebab-case/);
    expect(String((error as Error).message)).toMatch(/function:/);
  });

  it("requires truthField when a truth source is set", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "rows.yaml"), "name: r\ncompanies:\n  - { id: a, name: A, domain: a.com }\n");
    writeFileSync(
      join(dir, "s.yaml"),
      "name: s\ntitle: S\nfunction: { name: F, routineId: function:t_x }\nrows: rows.yaml\ninputs: { domain: $domain }\nestimate: { creditsPerRow: 1, actionsPerRow: 1 }\ntruth: tranco\ntargets: { coverage: 0.9, accuracy: 0.5 }\n",
    );
    expect(() => loadSuite(join(dir, "s.yaml"))).toThrow(/needs truthField/);
  });
});

describe("buildInputs", () => {
  const company = { id: "clay", name: "Clay", domain: "clay.com" };
  it("substitutes $fields and passes literals through", () => {
    expect(buildInputs({ "Company Domain": "$domain", Country: "US" }, company)).toEqual({ "Company Domain": "clay.com", Country: "US" });
  });
  it("rejects unknown fields", () => {
    expect(() => buildInputs({ x: "$linkedin" }, company)).toThrow(SuiteError);
  });
});
