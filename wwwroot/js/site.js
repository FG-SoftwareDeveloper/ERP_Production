// Please see documentation at https://learn.microsoft.com/aspnet/core/client-side/bundling-and-minification
// for details on configuring this project to bundle and minify static web assets.
/***Datatables Code */
// Global object to store DataTable instances and their configurations/states
const dataTableManager = {};

/**
 * Initia   zes a DataTable with given configuration and registers it with the manager.
 * This function now focuses on setting up the DataTable for data management,
 * and the actual rendering (table, card, chart) is handled by separate toggle functions.
 * @param {object} config - Configuration object for DataTable and custom views.
 * @param {string} config.tableId - The ID of the HTML table element.
 * @param {Array<object>} config.columns - DataTable column definitions.
 * @param {string} config.ajaxUrl - URL for AJAX data source.
 * @param {string} [config.ajaxMethod='GET'] - HTTP method for AJAX.
 * @param {string} [config.dataSrc=''] - DataTables dataSrc option.
 * @param {boolean} [config.serverSide=false] - Whether server-side processing is enabled.
 * @param {number} [config.pageLength=10] - Number of rows per page.
 * @param {Array<Array>} [config.defaultOrder=[]] - Default ordering.
 * @param {boolean} [config.initialIsCardView=false] - Initial view state (card or table).
 * @param {boolean} [config.initialIsChartView=false] - Initial view state (chart or table/card).
 * @param {object} [config.chartConfig] - Configuration for Chart.js if chart view is enabled.
 * @param {string} config.chartConfig.type - Chart type (e.g., 'bar', 'line').
 * @param {Function} config.chartConfig.processData - Function to transform AJAX data for the chart.
 * @param {object} [config.chartConfig.options] - Chart.js options.
 * @param {object} [config.rowGroup] - Configuration for DataTables RowGroup extension.
 */
function LoadDataTable(config) {
    if (!config || !config.tableId || !config.columns || !config.ajaxUrl) {
        console.error("LoadDataTable: Missing required configuration properties (tableId, columns, ajaxUrl).");
        return;
    }

    const $table = $(`#${config.tableId}`);

    // Store/update internal state for this specific DataTable
    // This ensures each DataTable instance has its own view state
    dataTableManager[config.tableId] = dataTableManager[config.tableId] || {
        isCardView: config.initialIsCardView || false,
        isChartView: config.initialIsChartView || false,
        chartInstance: null,
        originalConfig: config, // Store original config to re-initialize DataTable
        table: null // Will store the DataTable instance
    };

    const instanceState = dataTableManager[config.tableId];

    // If DataTable is already initialized, destroy it to re-initialize with new config
    // This handles cases where LoadDataTable might be called again (e.g., switching from chart back to table)
    if ($.fn.DataTable.isDataTable($table)) {
        console.log(`Destroying existing DataTable for #${config.tableId} for re-initialization.`);
        $table.DataTable().destroy();
        $table.empty(); // Clear existing table content to prevent issues
    }

    // Re-add original headers and an empty tbody if the table structure is gone
    // This is crucial for DataTables to initialize correctly
    if ($table.find('thead').length === 0) {
        let headerHtml = '<thead><tr>';
        config.columns.forEach(col => {
            // Only add headers for columns that are not 'Actions' or custom renderers
            // For 'Actions' column, include its title if defined
            headerHtml += `<th class="px-4 py-2 text-sm font-semibold text-gray-700 uppercase tracking-wider">${col.title || ''}</th>`;
        });
        headerHtml += '</tr></thead><tbody></tbody>';
        $table.html(headerHtml);
    }

    // Initialize DataTable
    const dataTableInstance = $table.DataTable({
        processing: true,
        serverSide: config.serverSide || false,
        ajax: {
            url: config.ajaxUrl,
            method: config.ajaxMethod || 'GET',
            dataSrc: config.dataSrc || '',
            error: function (xhr, error, thrown) {
                console.error(`AJAX error for DataTable ${config.tableId}:`, error, thrown, xhr);
                // Optionally display an error message in the table area
                $table.html('<tbody><tr><td colspan="' + config.columns.length + '" class="text-center text-red-500 py-4">Error loading data. Please try again.</td></tr></tbody>');
            }
        },
        columns: config.columns,
        responsive: true,
        pageLength: config.pageLength || 10,
        order: config.defaultOrder || [],
        // --- RowGroup extension support ---
        rowGroup: config.rowGroup || undefined,
        // drawCallback is primarily for internal DataTable rendering adjustments.
        // Custom view rendering (cards, chart) is now handled externally by toggle functions.
        drawCallback: function (settings) {
            console.log(`DataTable #${config.tableId} drawCallback executed.`);
            const api = this.api(); // Get DataTable API reference
            const currentPageState = dataTableManager[config.tableId]; // Get current state for this table

            const $tableWrapper = $table.closest('.dataTables_wrapper');
            const $chartContainer = $(`#${config.tableId}-chart-container`);
            const $cardsContainer = $(`#${config.tableId}-cards-container`);

            // Ensure correct container is visible based on current state
            if (currentPageState.isChartView) {
                $tableWrapper.hide();
                $cardsContainer.hide();
                $chartContainer.show();
            } else if (currentPageState.isCardView) {
                $tableWrapper.hide();
                $chartContainer.hide();
                $cardsContainer.show();
                renderCards(config.tableId); // Re-render cards on draw if in card view
            } else { // Table view
                $tableWrapper.show();
                $cardsContainer.hide();
                $chartContainer.hide();
            }
        }
    });

    // Store the DataTable instance in the manager
    instanceState.table = dataTableInstance;
    console.log(`DataTable for ${config.tableId} initialized.`);

    // Apply initial view state based on config
    if (instanceState.isChartView) {
        toggleChartView(config.tableId); // This will hide table and render chart
    } else if (instanceState.isCardView) {
        toggleTableView(config.tableId); // This will hide table and render cards
    } else {
        // Default to table view, ensure table is visible and cards/chart are hidden
        $(`#${config.tableId}`).closest('.dataTables_wrapper').show();
        $(`#${config.tableId}-cards-container`).hide().empty();
        destroyChart(config.tableId);
    }

    return dataTableInstance;
}

/**
 * Renders the DataTable data as cards in a separate container.
 * This function is called when switching to card view or on redraws while in card view.
 * @param {string} tableId - The ID of the HTML table element.
 */
/**
 * Renders the DataTable data as cards in a separate container.
 * @param {string} tableId - The ID of the HTML table element.
 */
function renderCards(tableId) {
    const instance = dataTableManager[tableId];
    if (!instance || !instance.table) {
        console.error(`renderCards: DataTable instance not found for ID: ${tableId}`);
        return;
    }

    const $table = $(`#${tableId}`);
    const $tableWrapper = $table.closest('.dataTables_wrapper');
    let $cardsContainer = $(`#${tableId}-cards-container`);

    // Ensure the cards container exists and is correctly placed
    if ($cardsContainer.length === 0) {
        $cardsContainer = $(`<div id="${tableId}-cards-container" class="row mt-4"></div>`);
        $tableWrapper.after($cardsContainer);
        console.log(`Created cards container #${tableId}-cards-container.`);
    }

    $tableWrapper.hide();
    $cardsContainer.empty().show(); // Clear existing content and show the container

    const api = instance.table;
    const data = api.rows({ page: 'current' }).data().toArray();

    console.log(`Rendering ${data.length} cards for ${tableId}.`);

    if (data.length === 0) {
        $cardsContainer.html('<p class="text-gray-600 text-center py-4">No data available to display in card view.</p>');
        return;
    }

    let cardsHtml = '';
    data.forEach(d => {
        cardsHtml += '<div class="data-card col m-2 bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow duration-200">';
        instance.originalConfig.columns.forEach(col => {
            if (col.title) {
                let value = d[col.data];
                if (col.data === null && col.render) {
                    value = col.render(d, 'display', d);
                    cardsHtml += `<div class="card-item card-actions mt-4">${value}</div>`;
                } else if (value !== undefined && value !== null) {
                    if (typeof value === 'object') {
                        value = JSON.stringify(value);
                    }
                    cardsHtml += `<div class="card-item"><strong class="text-gray-700">${col.title}:</strong> <span class="text-gray-800">${value}</span></div>`;
                } else {
                    value = '<span class="text-gray-400">N/A</span>';
                    cardsHtml += `<div class="card-item"><strong class="text-gray-700">${col.title}:</strong> <span class="text-gray-800">${value}</span></div>`;
                }
            }
        });
        // Ensure actions are added even if not the last column in the loop
        const actionsColumn = instance.originalConfig.columns.find(col => col.data === null && col.render && col.title === "Actions");
        if (actionsColumn && !cardsHtml.includes('card-actions')) { // Prevent double adding if already added in loop
            cardsHtml += `<div class="card-item card-actions mt-4">${actionsColumn.render(d, 'display', d)}</div>`;
        }
        cardsHtml += '</div>';
    });
    $cardsContainer.html(cardsHtml);
}

/**
 * Clears and hides the card view container, and shows the DataTable.
 * @param {string} tableId - The ID of the HTML table element.
 */
function clearCards(tableId) {
    const $table = $(`#${tableId}`);
    const $tableWrapper = $table.closest('.dataTables_wrapper');
    const $cardsContainer = $(`#${tableId}-cards-container`);

    $cardsContainer.empty().hide();
    $tableWrapper.show(); // Show the actual DataTable
    console.log(`Cleared card view for ${tableId}.`);
}

/**
 * Toggles the view mode (table vs. card) for a specific DataTable.
 * @param {string} tableId - The ID of the HTML table element.
 */
function toggleTableView(tableId) {
    const instance = dataTableManager[tableId];
    if (!instance) {
        console.error(`toggleTableView: DataTable instance not found for ID: ${tableId}`);
        return;
    }
    if (instance.isChartView) {
        console.warn(`toggleTableView: Cannot toggle table/card for ${tableId} while chart view is active. Please switch to table/card view first.`);
        return;
    }

    instance.isCardView = !instance.isCardView;

    if (instance.isCardView) {
        renderCards(tableId);
    } else {
        clearCards(tableId);
    }
    console.log(`Toggled ${tableId} to ${instance.isCardView ? 'card' : 'table'} view.`);
}

/**
 * Toggles the view mode (table/card vs. chart) for a specific DataTable.
 * @param {string} tableId - The ID of the HTML table element.
 */
function toggleChartView(tableId) {
    const instance = dataTableManager[tableId];
    if (!instance || !instance.originalConfig.chartConfig) {
        console.warn(`toggleChartView: Chart configuration missing for ${tableId}. Cannot toggle to chart view.`);
        return;
    }

    instance.isChartView = !instance.isChartView;

    if (instance.isChartView) {
        // Switch to chart view
        instance.isCardView = false; // Ensure not in card view when in chart view
        clearCards(tableId); // Clear any active card view

        // Hide the table wrapper
        $(`#${tableId}`).closest('.dataTables_wrapper').hide();
        renderChart(tableId);
    } else {
        // Switch back to table/card view
        destroyChart(tableId);
        // Show the table wrapper
        $(`#${tableId}`).closest('.dataTables_wrapper').show();
        // Re-draw DataTable to ensure it's fully rendered in table view
        // If the DataTable was destroyed (e.g., when entering chart view), re-initialize it.
        if (!instance.table || !$.fn.DataTable.isDataTable($(`#${tableId}`))) {
            LoadDataTable(instance.originalConfig); // Re-initialize if destroyed
        } else {
            instance.table.draw(); // Just draw if already exists
        }
    }
    console.log(`Toggled ${tableId} to ${instance.isChartView ? 'chart' : 'table/card'} view.`);
}

/**
 * Renders a Chart.js chart for a specific DataTable's data.
 * @param {string} tableId - The ID of the HTML table element.
 */
function renderChart(tableId) {
    const instance = dataTableManager[tableId];
    if (!instance || !instance.originalConfig.chartConfig) return;

    const chartConfig = instance.originalConfig.chartConfig;
    const chartContainerId = `${tableId}-chart-container`;
    const chartCanvasId = `${tableId}-chart`;

    let $chartContainer = $(`#${chartContainerId}`);
    if ($chartContainer.length === 0) {
        console.log(`Creating chart container #${chartContainerId}`);
        $chartContainer = $(`<div id="${chartContainerId}" class="chart-container bg-white p-6 rounded-xl shadow-md mt-4" style="display:none;"></div>`);
        $(`#${tableId}`).closest('.dataTables_wrapper').after($chartContainer);
    }
    $chartContainer.show(); // Ensure container is visible

    // Clear any existing content and append a new canvas
    let $canvas = $(`<canvas id="${chartCanvasId}"></canvas>`);
    $chartContainer.html($canvas); // This is crucial to ensure a fresh canvas element is in the DOM

    // Ensure the canvas element is actually in the DOM and has dimensions before getting context
    // The chart-container CSS should give it height, and responsive: true will handle width.
    // We can add a check here, but typically it's a CSS issue if canvas has 0 dimensions.

    if (instance.chartInstance) {
        instance.chartInstance.destroy();
        instance.chartInstance = null;
        console.log(`Destroyed previous chart instance for ${tableId}.`);
    }

    const ctx = $canvas[0].getContext('2d');
    if (!ctx) {
        console.error(`renderChart: Failed to get 2D context for canvas #${chartCanvasId}. Canvas element might not be ready or supported.`);
        $chartContainer.html('<p class="text-red-500 text-center py-4">Error: Could not create chart canvas. Your browser might not support Canvas API or there\'s a rendering issue.</p>');
        return;
    }
    console.log(`Successfully got 2D context for canvas #${chartCanvasId}.`);


    $.ajax({
        url: instance.originalConfig.ajaxUrl,
        method: instance.originalConfig.ajaxMethod || 'GET',
        success: function (data) {
            console.log(`Chart data fetched for ${tableId}:`, data);
            if (!data || data.length === 0) {
                $chartContainer.html('<p class="text-gray-600 text-center py-4">No data available to display in chart view.</p>');
                console.warn(`No data received for chart ${tableId}.`);
                return;
            }

            const processedData = chartConfig.processData(data, instance.originalConfig.columns);
            console.log(`Processed chart data for ${tableId}:`, processedData);

            // Merge default options with custom chartConfig.options
            const chartOptions = {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            font: {
                                family: 'Inter, sans-serif'
                            }
                        }
                    },
                    title: {
                        display: true,
                        font: {
                            size: 18,
                            family: 'Inter, sans-serif'
                        },
                        padding: {
                            top: 10,
                            bottom: 20
                        }
                    },
                    tooltip: { // Custom tooltip configuration
                        callbacks: {
                            label: function (context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed.y);
                                }
                                return label;
                            },
                            afterLabel: function (context) {
                                // Access the custom 'accountType' property from the raw data point
                                // This assumes 'accountType' is part of the dataPoints object in processData
                                const accountType = context.raw ? context.raw.accountType : null;
                                return accountType ? `Type: ${accountType}` : '';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            font: {
                                family: 'Inter, sans-serif'
                            }
                        },
                        title: {
                            display: true, // Ensure X-axis title is displayed
                            text: 'Account Name', // Explicitly set X-axis title
                            font: {
                                family: 'Inter, sans-serif'
                            }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            font: {
                                family: 'Inter, sans-serif'
                            }
                        },
                        title: {
                            display: true, // Ensure Y-axis title is displayed
                            text: 'Balance ($)', // Explicitly set Y-axis title
                            font: {
                                family: 'Inter, sans-serif'
                            }
                        }
                    }
                },
                font: { // Global font setting for Chart.js
                    family: 'Inter, sans-serif'
                },
                animation: {
                    duration: 1000,
                    easing: 'easeOutQuart'
                },
                ...chartConfig.options // Merge custom options provided in chartConfig.options
            };


            instance.chartInstance = new Chart(ctx, {
                type: chartConfig.type,
                data: processedData,
                options: chartOptions // Use the merged options
            });
            console.log(`Chart for ${tableId} rendered successfully.`);

        },
        error: function (xhr, status, error) {
            console.error(`Error fetching data for chart ${tableId}:`, error, xhr);
            $chartContainer.html('<p class="text-red-500 text-center py-4">Error loading chart data. Please try again.</p>');
        }
    });
}

/**
 * Destroys the Chart.js chart instance for a specific DataTable.
 * @param {string} tableId - The ID of the HTML table element.
 */
function destroyChart(tableId) {
    const instance = dataTableManager[tableId];
    if (instance && instance.chartInstance) {
        instance.chartInstance.destroy();
        instance.chartInstance = null;
        $(`#${tableId}-chart-container`).hide();
        $(`#${tableId}-chart-container`).remove(); // Remove from DOM to clean up
        console.log(`Chart for ${tableId} destroyed and container removed.`);
    }
}

/**
 * Utility function for DataTables column search.
 * Usage: dt.column(index).search(value).draw();
 */
function initializeCurrentPageFeatures() {
    // If you want to re-initialize filter badges after AJAX loads, call updateActiveFilterBadges here if needed.
    if (typeof updateActiveFilterBadges === "function") {
        updateActiveFilterBadges();
    }
}

// Write your JavaScript code.
$(document).ready(function () {
    // Theme Toggle Logic
    const themeToggle = $('#themeToggle');
    const htmlElement = $('html'); // Target the html element for data-theme

    // Function to set the theme
    function setTheme(theme) {
        htmlElement.attr('data-theme', theme);
        localStorage.setItem('theme', theme);
        // Update the checkbox state
        themeToggle.prop('checked', theme === 'dark');
    }

    // Load theme from localStorage on page load
    const savedTheme = localStorage.getItem('theme') || 'light'; // Default to light
    setTheme(savedTheme);

    // Listen for theme toggle changes
    themeToggle.on('change', function () {
        if ($(this).is(':checked')) {
            setTheme('dark');
        } else {
            setTheme('light');
        }
    });

    // Combined Toggle functionality for Navbar and Sidebar
    $("#combinedNavbarSidebarToggle").click(function (e) {
        e.preventDefault();
        $("#wrapper").toggleClass("toggled");
    });

    // Function to set active class on sidebar link
    function setActiveLink(path) {
        $('#sidebarMenu .nav-link').removeClass('active');
        $('#sidebarMenu a.nav-link').each(function () {
            const linkUrl = $(this).data('page-url');
            if (linkUrl && (path === linkUrl || (path.startsWith(linkUrl) && linkUrl !== "/"))) {
                $(this).addClass('active');
            } else if (linkUrl === "/Index" && path === "/") {
                $(this).addClass('active');
            }
        });
    }

    // Initial active link setting
    setActiveLink(window.location.pathname);

    // AJAX page loading logic
    async function loadPageContent(url, pushState = true) {
        try {
            const response = await fetch(url);
            const html = await response.text();

            // Create a temporary div to parse the fetched HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;

            // Extract the content of the <main> tag
            const newMainContent = tempDiv.querySelector('main[role="main"]');

            if (newMainContent) {
                // Replace the current main content
                $('#main-content-area').html(newMainContent.innerHTML);

                // Update the browser URL without reloading
                if (pushState) {
                    history.pushState({ path: url }, '', url);
                }

                // Update active sidebar link
                setActiveLink(url);

                // Scroll to top of the content area, not the entire page
                $('#main-content-area').scrollTop(0);

                // Re-initialize DataTables and Charts for the new content
                // This function will be defined in site.js
                if (typeof initializeCurrentPageFeatures === 'function') {
                    initializeCurrentPageFeatures();
                }
            } else {
                console.error('Could not find <main> content in fetched HTML for:', url);
            }
        } catch (error) {
            console.error('Error loading page content:', error);
            // Optionally, redirect to the full page on error
            window.location.href = url;
        }
    }

    // Handle sidebar link clicks
    $(document).on('click', '.sidebar-ajax-link', function (e) {
        e.preventDefault(); // Prevent default link behavior
        const url = $(this).data('page-url');
        if (url) {
            loadPageContent(url);
        }
    });

    // Handle browser back/forward buttons
    window.addEventListener('popstate', (event) => {
        if (event.state && event.state.path) {
            loadPageContent(event.state.path, false); // Don't push state again
        } else {
            // Fallback for initial page load or if state is null
            loadPageContent(window.location.pathname, false);
        }
    });

    // Initial load of page features (for the page loaded on first visit)
    // This will ensure DataTables and Charts on the initial page are set up.
    if (typeof initializeCurrentPageFeatures === 'function') {
        initializeCurrentPageFeatures();
    }

    /**Home Page*/

    // Simple animation for KPI numbers (optional, but adds a nice touch)
    function animateValue(id, start, end, duration, prefix = '', suffix = '') {
        let current = start;
        const range = end - start;
        const increment = end > start ? 1 : -1;
        const stepTime = Math.abs(Math.floor(duration / range));
        const obj = document.getElementById(id);

        if (!obj) return; // Exit if element not found

        const timer = setInterval(() => {
            current += increment;
            if ((increment > 0 && current > end) || (increment < 0 && current < end)) {
                current = end;
            }
            if (id === 'kpiRevenue' || id === 'kpiTotalInventoryValue') { // Assuming these are currency
                obj.textContent = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(current);
            } else if (id === 'kpiProfitMargin') {
                obj.textContent = current.toFixed(1) + '%';
            } else {
                obj.textContent = prefix + current.toLocaleString() + suffix;
            }

            if (current === end) {
                clearInterval(timer);
            }
        }, stepTime);
    }

    // Trigger animations for KPIs on page load
    // Using dummy values for now. In a real app, these would come from your backend.
    animateValue('kpiRevenue', 0, 1234567, 2000);
    animateValue('kpiProfitMargin', 0, 28.5, 1500);
    animateValue('kpiActiveUsers', 0, 1500, 1800, '', '+');

    // Add a subtle bounce animation to the hero button after a delay
    setTimeout(() => {
        $('.animate-bounce-once').removeClass('animate-bounce-once').addClass('animate-pulse-subtle');
    }, 2500); // Remove bounce and add subtle pulse after 2.5 seconds

    // Simple intersection observer for fade-in effect on sections
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                $(entry.target).addClass('fade-in-visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    $('.module-card, .data-card, .dashboard-link-card').each(function () {
        observer.observe(this);
    });

});