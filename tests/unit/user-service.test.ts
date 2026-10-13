import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUserService, DuplicateEmailError } from "@/lib/user-service";
import { hashPassword, verifyPassword } from "@/lib/password";
const input = {
  name: "Test Student",
  email: "test@example.com",
  password: "a long unique passphrase",
};
const publicUser = { id: "test-id", name: input.name, email: input.email };
const store = { findByEmail: vi.fn(), create: vi.fn() };
const service = createUserService(store);
beforeEach(() => {
  vi.resetAllMocks();
  store.findByEmail.mockResolvedValue(null);
  store.create.mockResolvedValue(publicUser);
});
describe("passwords (real bcrypt, no hash mock)", () => {
  it("salts hashes, verifies the right password, and rejects a wrong one", async () => {
    const a = await hashPassword(input.password);
    const b = await hashPassword(input.password);
    expect(a).not.toBe(input.password);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^\$2[ab]\$12\$/);
    expect(await verifyPassword(input.password, a)).toBe(true);
    expect(await verifyPassword("wrong password long enough", a)).toBe(false);
  });
  it("refuses passwords bcrypt would truncate", async () => {
    await expect(hashPassword("😀".repeat(19))).rejects.toThrow();
  });
});
describe("registration (mocked persistence)", () => {
  it("persists only a hash and returns public fields", async () => {
    const result = await service.register(input);
    expect(store.create).toHaveBeenCalledOnce();
    const saved = store.create.mock.calls[0][0];
    expect(saved.password).toBeUndefined();
    expect(await verifyPassword(input.password, saved.passwordHash)).toBe(true);
    expect(result).toEqual(publicUser);
    expect(result).not.toHaveProperty("passwordHash");
  });
  it("rejects an existing email", async () => {
    store.findByEmail.mockResolvedValue(publicUser);
    await expect(service.register(input)).rejects.toBeInstanceOf(
      DuplicateEmailError,
    );
    expect(store.create).not.toHaveBeenCalled();
  });
  it("handles a duplicate race using the unique database constraint", async () => {
    store.create.mockRejectedValue({ code: "P2002" });
    await expect(service.register(input)).rejects.toBeInstanceOf(
      DuplicateEmailError,
    );
  });
  it("rejects invalid input before touching persistence", async () => {
    await expect(
      service.register({ ...input, password: "short" }),
    ).rejects.toThrow();
    expect(store.findByEmail).not.toHaveBeenCalled();
  });
});
describe("authentication (mocked persistence)", () => {
  it("returns safe identity for valid credentials", async () => {
    store.findByEmail.mockResolvedValue({
      ...publicUser,
      passwordHash: await hashPassword(input.password),
    });
    expect(await service.authenticate(input)).toEqual(publicUser);
  });
  it("returns null for wrong passwords and missing users", async () => {
    store.findByEmail.mockResolvedValue({
      ...publicUser,
      passwordHash: await hashPassword(input.password),
    });
    expect(
      await service.authenticate({
        ...input,
        password: "wrong password long enough",
      }),
    ).toBeNull();
    store.findByEmail.mockResolvedValue(null);
    expect(await service.authenticate(input)).toBeNull();
  });
  it("rejects malformed credentials without querying the DB", async () => {
    expect(
      await service.authenticate({ email: "bad", password: "short" }),
    ).toBeNull();
    expect(store.findByEmail).not.toHaveBeenCalled();
  });
});
