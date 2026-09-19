import { DecimalPipe, KeyValuePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Papa from 'papaparse';
import { PrimeTemplate } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { FileSelectEvent, FileUploadModule } from 'primeng/fileupload';
import { MessageModule } from 'primeng/message';
import { ProgressBarModule } from 'primeng/progressbar';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { Account } from '../../core/models/account.model';
import { ReferenceData } from '../../core/models/reference-data.model';
import { AccountsService } from '../../core/services/accounts.service';
import { BulkPaymentsService, BulkUploadResponse } from '../../core/services/bulk-payments.service';
import { ReferenceDataService } from '../../core/services/reference-data.service';
import { BulkRow, isSwiftLike, validateBulkRow } from './bulk-row-validator';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_ROWS = 2000;
const CHUNK_SIZE = 200;

@Component({
  selector: 'app-bulk-upload',
  imports: [
    DecimalPipe,
    KeyValuePipe,
    FormsModule,
    ButtonModule,
    FileUploadModule,
    MessageModule,
    ProgressBarModule,
    SelectModule,
    TableModule,
    TagModule,
    PrimeTemplate,
  ],
  templateUrl: './bulk-upload.html',
})
export class BulkUpload {
  private readonly bulkPaymentsService = inject(BulkPaymentsService);
  private readonly accountsService = inject(AccountsService);
  private readonly referenceDataService = inject(ReferenceDataService);

  protected readonly accounts = signal<Account[]>([]);
  protected readonly referenceData = signal<ReferenceData | null>(null);
  protected readonly debtorAccountId = signal<string | null>(null);

  protected readonly fileName = signal<string | null>(null);
  protected readonly fileError = signal<string | null>(null);
  protected readonly rows = signal<BulkRow[]>([]);
  protected readonly validating = signal(false);
  protected readonly validationProgress = signal(0);
  protected readonly showInvalidOnly = signal(false);

  protected readonly submitting = signal(false);
  protected readonly serverResult = signal<BulkUploadResponse | null>(null);
  protected readonly serverError = signal<string | null>(null);

  private file: File | null = null;

  protected readonly totalRows = computed(() => this.rows().length);
  protected readonly invalidRows = computed(() => this.rows().filter((r) => r.errors.length > 0));
  protected readonly validRows = computed(() => this.rows().filter((r) => r.errors.length === 0));
  protected readonly visibleRows = computed(() => (this.showInvalidOnly() ? this.invalidRows() : this.rows()));

  protected readonly duplicateReferences = computed(() => {
    const seen = new Map<string, number>();
    for (const row of this.rows()) {
      if (!row.clientReference) continue;
      seen.set(row.clientReference, (seen.get(row.clientReference) ?? 0) + 1);
    }
    return [...seen.values()].filter((count) => count > 1).length;
  });

  protected readonly amountByCurrency = computed(() => {
    const totals: Record<string, number> = {};
    for (const row of this.validRows()) {
      if (row.amount == null) continue;
      totals[row.currency] = (totals[row.currency] ?? 0) + row.amount;
    }
    return totals;
  });

  protected readonly canSubmit = computed(
    () => this.rows().length > 0 && this.invalidRows().length === 0 && !!this.debtorAccountId() && !this.validating(),
  );

  protected readonly isSwiftLike = isSwiftLike;

  constructor() {
    this.accountsService.list().subscribe((accounts) => this.accounts.set(accounts));
    this.referenceDataService.get().subscribe((referenceData) => this.referenceData.set(referenceData));
  }

  onFileSelect(event: FileSelectEvent): void {
    const file = event.files?.[0];
    if (!file) return;

    this.resetForNewFile(file);

    if (file.size > MAX_FILE_SIZE) {
      this.fileError.set('File exceeds the 5 MB limit.');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      this.fileError.set('Only CSV files are accepted.');
      return;
    }

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => this.onParsed(result.data),
      error: () => this.fileError.set('Could not read this file.'),
    });
  }

  private resetForNewFile(file: File): void {
    this.file = file;
    this.fileName.set(file.name);
    this.fileError.set(null);
    this.rows.set([]);
    this.showInvalidOnly.set(false);
    this.serverResult.set(null);
    this.serverError.set(null);
  }

  private onParsed(data: Record<string, string>[]): void {
    if (data.length > MAX_ROWS) {
      this.fileError.set(`File has ${data.length} rows - the maximum is ${MAX_ROWS}.`);
      return;
    }
    this.validateInChunks(data);
  }

  // Validates in chunks with a setTimeout(0) yield between them, so a
  // 2,000-row file doesn't block the main thread and freeze the UI.
  private validateInChunks(data: Record<string, string>[]): void {
    this.validating.set(true);
    this.validationProgress.set(0);
    const referenceData = this.referenceData();
    const seenReferences = new Set<string>();
    const results: BulkRow[] = [];
    let index = 0;

    const processChunk = () => {
      const end = Math.min(index + CHUNK_SIZE, data.length);
      for (; index < end; index++) {
        results.push(validateBulkRow(data[index], index + 2, referenceData, seenReferences));
      }
      this.validationProgress.set(Math.round((index / data.length) * 100));

      if (index < data.length) {
        setTimeout(processChunk, 0);
      } else {
        this.rows.set(results);
        this.validating.set(false);
      }
    };

    processChunk();
  }

  submit(): void {
    if (!this.canSubmit() || !this.file || !this.debtorAccountId()) return;
    this.submitting.set(true);
    this.serverError.set(null);
    this.bulkPaymentsService.upload(this.file, this.debtorAccountId()!).subscribe({
      next: (result) => {
        this.submitting.set(false);
        this.serverResult.set(result);
      },
      error: (err) => {
        this.submitting.set(false);
        const message = (err as { error?: { message?: string } })?.error?.message;
        this.serverError.set(message ?? 'Could not submit this batch. Please try again.');
      },
    });
  }
}
