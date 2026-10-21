"use client";

import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useBankAccounts, useBanks } from "@/hooks/use-api";

type BankSelectProps = {
  id?: string;
  /** The selected bank ACCOUNT id — this is what every payment actually attributes to. */
  value: string;
  onChange: (bankAccountId: string) => void;
  disabled?: boolean;
  required?: boolean;
};

/**
 * Two-step picker: choose a bank, then choose one of that bank's accounts. The external
 * contract (value/onChange) is still just the bank_account_id — the bank step is purely
 * a filter to narrow the second dropdown, never sent anywhere itself.
 */
export function BankSelect({
  id = "bank-select",
  value,
  onChange,
  disabled,
  required,
}: BankSelectProps) {
  const { data: banksData, isLoading: banksLoading } = useBanks();
  const { data: accountsData, isLoading: accountsLoading } = useBankAccounts();
  const banks = (banksData ?? []).filter((b) => b.is_active);
  const accounts = accountsData ?? [];

  // Bank step is derived, not synced via effect: whenever `value` names a real account, that
  // account's own bank_id wins (so editing an existing payment or a form reset always shows
  // the right bank with no stale state). `manualBankId` only matters in between — after the
  // user picks a bank but before they've picked an account yet, when `value` is still empty.
  const [manualBankId, setManualBankId] = useState<string>("");
  const selectedAccount = accounts.find((a) => a.id === value);
  const selectedBankId = selectedAccount?.bank_id || manualBankId;

  const accountsForBank = useMemo(
    () => accounts.filter((a) => a.is_active && a.bank_id === selectedBankId),
    [accounts, selectedBankId]
  );

  const handleBankChange = (bankId: string) => {
    setManualBankId(bankId);
    onChange("");
  };

  if (banksLoading || accountsLoading) {
    return <Skeleton className="h-10 w-full" />;
  }

  if (banks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No banks configured. Add a bank under Banks.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={`${id}-bank`}>
          Bank {required ? <span className="text-destructive">*</span> : null}
        </Label>
        <Select value={selectedBankId} onValueChange={handleBankChange} disabled={disabled}>
          <SelectTrigger id={`${id}-bank`}>
            <SelectValue placeholder="Select bank" />
          </SelectTrigger>
          <SelectContent>
            {banks.map((bank) => (
              <SelectItem key={bank.id} value={bank.id}>
                {bank.name}
                {bank.code ? ` (${bank.code})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-account`}>
          Account {required ? <span className="text-destructive">*</span> : null}
        </Label>
        <Select
          value={value}
          onValueChange={onChange}
          disabled={disabled || !selectedBankId}
        >
          <SelectTrigger id={`${id}-account`}>
            <SelectValue
              placeholder={selectedBankId ? "Select account" : "Select a bank first"}
            />
          </SelectTrigger>
          <SelectContent>
            {accountsForBank.length === 0 ? (
              <SelectItem value="__no_accounts__" disabled>
                No accounts for this bank yet
              </SelectItem>
            ) : (
              accountsForBank.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  Acct {account.account_number}
                  {account.account_name ? ` (${account.account_name})` : ""}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
