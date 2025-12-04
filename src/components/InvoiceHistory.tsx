/**
 * Invoice History Component
 *
 * Displays a list of invoices with filtering and status tracking.
 */

import { useState, useMemo } from 'react';
import type { Invoice } from '../hooks/useInvoices';

export interface InvoiceHistoryProps {
  invoices: Invoice[];
  onSelectInvoice?: (invoice: Invoice) => void;
  onPayInvoice?: (invoice: Invoice) => void;
}

type FilterStatus = 'all' | 'pending' | 'paid' | 'expired' | 'failed';

export function InvoiceHistory({
  invoices,
  onSelectInvoice,
  onPayInvoice,
}: InvoiceHistoryProps) {
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter and search invoices
  const filteredInvoices = useMemo(() => {
    let result = invoices;

    // Apply status filter
    if (filter !== 'all') {
      result = result.filter((inv) => inv.status === filter);
    }

    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (inv) =>
          inv.id.toLowerCase().includes(query) ||
          inv.customerName.toLowerCase().includes(query) ||
          inv.customerEmail.toLowerCase().includes(query) ||
          inv.description.toLowerCase().includes(query)
      );
    }

    // Sort by creation date (newest first)
    return result.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }, [invoices, filter, searchQuery]);

  // Calculate stats
  const stats = useMemo(() => {
    return {
      total: invoices.length,
      pending: invoices.filter((inv) => inv.status === 'pending').length,
      paid: invoices.filter((inv) => inv.status === 'paid').length,
      expired: invoices.filter((inv) => inv.status === 'expired').length,
      failed: invoices.filter((inv) => inv.status === 'failed').length,
      totalAmount: invoices
        .filter((inv) => inv.status === 'paid')
        .reduce((sum, inv) => sum + parseFloat(inv.amount), 0)
        .toFixed(2),
    };
  }, [invoices]);

  const getStatusColor = (status: Invoice['status']) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-700';
      case 'pending':
        return 'bg-yellow-100 text-yellow-700';
      case 'expired':
        return 'bg-gray-100 text-gray-700';
      case 'failed':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusIcon = (status: Invoice['status']) => {
    switch (status) {
      case 'paid':
        return '✓';
      case 'pending':
        return '⏱';
      case 'expired':
        return '⏰';
      case 'failed':
        return '✗';
      default:
        return '?';
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-soft">
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-sm text-gray-600">Total Invoices</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-soft">
          <div className="text-2xl font-bold text-green-600">{stats.paid}</div>
          <div className="text-sm text-gray-600">Paid</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-soft">
          <div className="text-2xl font-bold text-yellow-600">
            {stats.pending}
          </div>
          <div className="text-sm text-gray-600">Pending</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-soft">
          <div className="text-2xl font-bold text-bnb-yellow">
            ${stats.totalAmount}
          </div>
          <div className="text-sm text-gray-600">Total Collected</div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white p-4 rounded-lg shadow-soft">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Status Filter */}
          <div className="flex gap-2 flex-wrap">
            {(['all', 'pending', 'paid', 'expired', 'failed'] as FilterStatus[]).map(
              (status) => (
                <button
                  key={status}
                  onClick={() => setFilter(status)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    filter === status
                      ? 'bg-bnb-yellow text-gray-900'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              )
            )}
          </div>

          {/* Search */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search invoices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-bnb-yellow"
            />
          </div>
        </div>
      </div>

      {/* Invoice List */}
      <div className="space-y-3">
        {filteredInvoices.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow-soft text-center text-gray-500">
            {searchQuery
              ? 'No invoices match your search'
              : filter === 'all'
              ? 'No invoices yet'
              : `No ${filter} invoices`}
          </div>
        ) : (
          filteredInvoices.map((invoice) => (
            <div
              key={invoice.id}
              className="bg-white p-4 rounded-lg shadow-soft hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => onSelectInvoice?.(invoice)}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Invoice Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                        invoice.status
                      )}`}
                    >
                      {getStatusIcon(invoice.status)} {invoice.status.toUpperCase()}
                    </span>
                    <span className="text-sm text-gray-600">
                      #{invoice.id}
                    </span>
                  </div>
                  <div className="font-semibold text-gray-900 mb-1">
                    {invoice.customerName}
                  </div>
                  <div className="text-sm text-gray-600 mb-1">
                    {invoice.description}
                  </div>
                  <div className="text-xs text-gray-500">
                    Created: {invoice.createdAt.toLocaleDateString()} • Due:{' '}
                    {invoice.dueDate.toLocaleDateString()}
                  </div>
                </div>

                {/* Amount */}
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-900">
                    {invoice.amount}
                  </div>
                  <div className="text-sm text-gray-600">{invoice.currency}</div>
                </div>

                {/* Actions */}
                {invoice.status === 'pending' &&
                  new Date() < invoice.dueDate && (
                    <div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onPayInvoice?.(invoice);
                        }}
                        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all"
                      >
                        Pay Now
                      </button>
                    </div>
                  )}

                {invoice.status === 'paid' && invoice.txHash && (
                  <div className="text-right">
                    <a
                      href={`https://${
                        invoice.network === 'testnet' ? 'testnet.' : ''
                      }bscscan.com/tx/${invoice.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-sm text-blue-600 hover:text-blue-700 underline"
                    >
                      View Tx
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
