import { check } from "k6";
import http from "k6/http";
import { Counter, Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:5000";
const VUS = Number(__ENV.VUS || 1000);
const DURATION = __ENV.DURATION || "30s";
const TEST_ACCOUNT_ID = __ENV.TEST_ACCOUNT_ID || "ACC_LOAD_001";
const INITIAL_BALANCE = Number(__ENV.INITIAL_BALANCE || 250000);

const txSuccess = new Counter("tx_success");
const txConflict = new Counter("tx_conflict");
const txFailed = new Counter("tx_failed");
const internalErrors = new Rate("internal_errors");

export const options = {
  scenarios: {
    concurrent_transactions: {
      executor: "constant-vus",
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: {
    internal_errors: ["rate==0"],
    http_req_duration: ["p(95)<2000"],
  },
};

export function setup() {
  const createResponse = http.post(
    `${BASE_URL}/api/accounts`,
    JSON.stringify({
      accountId: TEST_ACCOUNT_ID,
      holderName: "Load Test Account",
      balance: INITIAL_BALANCE,
    }),
    {
      headers: { "Content-Type": "application/json" },
    },
  );

  check(createResponse, {
    "setup account created or already exists": (res) =>
      res.status === 201 || res.status === 409,
  });

  return {
    accountId: TEST_ACCOUNT_ID,
  };
}

export default function (data) {
  const payload = JSON.stringify({
    accountId: data.accountId,
    amount: 1,
  });

  const depositResponse = http.post(
    `${BASE_URL}/api/transactions/deposit`,
    payload,
    {
      headers: { "Content-Type": "application/json" },
    },
  );

  const withdrawResponse = http.post(
    `${BASE_URL}/api/transactions/withdraw`,
    payload,
    {
      headers: { "Content-Type": "application/json" },
    },
  );

  [depositResponse, withdrawResponse].forEach((response) => {
    if (response.status >= 200 && response.status < 300) {
      txSuccess.add(1);
    } else if (response.status === 409) {
      txConflict.add(1);
    } else {
      txFailed.add(1);
    }

    internalErrors.add(response.status >= 500);
  });
}

export function teardown(data) {
  const accountResponse = http.get(
    `${BASE_URL}/api/accounts/${data.accountId}`,
  );

  const accountPayload = accountResponse.json();
  check(accountResponse, {
    "account lookup succeeds": (res) => res.status === 200,
    "final balance is never negative": () =>
      accountPayload && Number(accountPayload.balance) >= 0,
  });

  console.log(
    `Load test finished for ${data.accountId}. Final balance: ${
      accountPayload ? accountPayload.balance : "unavailable"
    }`,
  );
}
