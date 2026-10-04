//! High-Performance Monte-Carlo Engine in Rust with Rayon.
//! Designed for 100x compute acceleration in production SaaS clusters.

use rayon::prelude::*;
use rand::thread_rng;
use rand_distr::{Distribution, Normal};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimParams {
    pub leads: f64,
    pub qual: f64,
    pub close: f64,
    pub ticket: f64,
    pub iterations: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimResult {
    pub iterations_run: usize,
    pub p10_conservative_revenue: f64,
    pub median_revenue_p50: f64,
    pub p90_optimistic_revenue: f64,
    pub histogram_bins: Vec<f64>,
    pub histogram_counts: Vec<usize>,
}

pub fn run_monte_carlo(params: SimParams) -> SimResult {
    let iterations = if params.iterations == 0 { 5000 } else { params.iterations };

    // Parallel stochastic simulation across all CPU cores via Rayon
    let mut revenues: Vec<f64> = (0..iterations)
        .into_par_iter()
        .map_init(thread_rng, |rng, _| {
            let dist_leads = Normal::new(params.leads, (params.leads * 0.12).max(1.0)).unwrap();
            let dist_qual = Normal::new(params.qual, 0.04).unwrap();
            let dist_close = Normal::new(params.close, 0.03).unwrap();
            let dist_ticket = Normal::new(params.ticket, (params.ticket * 0.1).max(100.0)).unwrap();

            let leads = dist_leads.sample(rng).max(10.0);
            let qual = dist_qual.sample(rng).clamp(0.05, 0.95);
            let close = dist_close.sample(rng).clamp(0.05, 0.95);
            let ticket = dist_ticket.sample(rng).max(50_000.0);

            leads * qual * close * ticket
        })
        .collect();

    // Sort to extract percentiles
    revenues.par_sort_unstable_by(|a, b| a.partial_cmp(b).unwrap());

    let p10 = revenues[(iterations as f64 * 0.10) as usize];
    let p50 = revenues[(iterations as f64 * 0.50) as usize];
    let p90 = revenues[(iterations as f64 * 0.90) as usize];

    // Compute 20 Histogram Bins
    let min_val = revenues[0];
    let max_val = revenues[iterations - 1];
    let bin_step = (max_val - min_val) / 20.0;

    let mut bins = Vec::with_capacity(21);
    for i in 0..=20 {
        bins.push(min_val + (i as f64) * bin_step);
    }

    let mut counts = vec![0; 20];
    for r in &revenues {
        let mut idx = ((r - min_val) / bin_step) as usize;
        if idx >= 20 {
            idx = 19;
        }
        counts[idx] += 1;
    }

    SimResult {
        iterations_run: iterations,
        p10_conservative_revenue: p10,
        median_revenue_p50: p50,
        p90_optimistic_revenue: p90,
        histogram_bins: bins,
        histogram_counts: counts,
    }
}
