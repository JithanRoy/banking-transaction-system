CREATE TABLE IF NOT EXISTS accounts (
  account_id VARCHAR(50) PRIMARY KEY,
  holder_name VARCHAR(100) NOT NULL,
  balance NUMERIC(14, 2) NOT NULL CHECK (balance >= 0),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('deposit', 'withdraw', 'transfer')),
  source_account_id VARCHAR(50),
  destination_account_id VARCHAR(50),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_source_account
    FOREIGN KEY (source_account_id) REFERENCES accounts(account_id) ON DELETE SET NULL,
  CONSTRAINT fk_destination_account
    FOREIGN KEY (destination_account_id) REFERENCES accounts(account_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_source_account_id ON transactions(source_account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_destination_account_id ON transactions(destination_account_id);
