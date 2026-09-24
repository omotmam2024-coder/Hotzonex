import { test } from "node:test";
import assert from "node:assert/strict";
import { renderBusinessFacts, unfinishedFields, loadBusiness } from "../src/business.js";

test("placeholders and unpriced packages never reach the prompt", () => {
  const biz = {
    name: "Hotzonex WiFi", currency: "SSP", location: "EDIT ME: somewhere", hours: "8am-10pm",
    packages: [
      { name: "1 Day", price: 1500, validity: "24 hours" },
      { name: "EDIT ME: 1 Week", price: 0, validity: "7 days" },
    ],
    payment_methods: ["Cash", "EDIT ME: mobile money"],
  };
  const text = renderBusinessFacts(biz);
  assert.match(text, /1 Day: 1,500 SSP — valid 24 hours/);
  assert.doesNotMatch(text, /EDIT ME/);
  assert.doesNotMatch(text, /1 Week/);
  assert.match(text, /Location: \(not provided/);
  assert.deepEqual(unfinishedFields(biz), ["location", "packages[1].name", "payment_methods[1]", "packages[1].price"]);
});

test("the shipped business.json is valid and flagged as unfinished", () => {
  const biz = loadBusiness();
  assert.ok(unfinishedFields(biz).length > 0);
  assert.doesNotMatch(renderBusinessFacts(biz), /EDIT ME/);
});
