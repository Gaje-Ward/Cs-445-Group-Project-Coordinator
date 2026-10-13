import { describe, expect, it } from "vitest";
import { registrationSchema } from "@/lib/validation";
const valid = {
  name: "Gaje Ward",
  email: "gaje@example.com",
  password: "a long passphrase",
};
describe("registration validation", () => {
  it("normalizes names and email without changing passwords", () => {
    expect(
      registrationSchema.parse({
        ...valid,
        name: " Gaje Ward ",
        email: " GAJE@example.com ",
      }),
    ).toEqual(valid);
  });
  it.each([
    { name: "A" },
    { email: "invalid" },
    { password: "short" },
    { password: "a".repeat(73) },
    { password: "😀".repeat(19) },
  ])("rejects invalid input %j", (input) => {
    expect(registrationSchema.safeParse({ ...valid, ...input }).success).toBe(
      false,
    );
  });
  it("allows Unicode passwords within the bcrypt byte limit", () => {
    expect(
      registrationSchema.safeParse({ ...valid, password: "😀".repeat(12) })
        .success,
    ).toBe(true);
  });
  it("rejects client-supplied sensitive fields", () => {
    expect(
      registrationSchema.safeParse({
        ...valid,
        role: "admin",
        passwordHash: "anything",
        id: "other-user",
      }).success,
    ).toBe(false);
  });
});
