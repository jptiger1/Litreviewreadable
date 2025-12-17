// app.js - Enhanced with loading states and row information
const API_URL = 'https://script.google.com/macros/s/AKfycbzJrqkQJHpevwKG6dZFfvikfvSb_lD_ySxZI5ZAZCyKOVcOMAKiD9LQUrAGWWhRTILbWw/exec';

const state = {
    reviewer: null,
    role: null,
    articles: [],
    currentIndex: 0,
    reviewHistory: []
};

const REASONS = {
    exclude: ['duplicate','not HAI', 'not perceived transparency', 'not English', 'not peer-reviewed', 'other']
};

// Loading overlay functions
function showLoading(message = 'Loading...') {
    const overlay = document.getElementById('loadingOverlay');
    const text = document.getElementById('loadingText');
    text.textContent = message;
    overlay.style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

async function initializeApp() {
    showLoading('Loading reviewers...');
    await loadReviewers();
    hideLoading();
    setupEventListeners();
    
    const savedReviewer = localStorage.getItem('reviewer');
    const savedRole = localStorage.getItem('role');
    
    if (savedReviewer && savedRole) {
        document.getElementById('reviewerSelect').value = savedReviewer;
        document.querySelector(`input[name="role"][value="${savedRole}"]`).checked = true;
    }
}

function setupEventListeners() {
    document.getElementById('startReviewBtn').addEventListener('click', handleLogin);
    document.querySelectorAll('input[name="decision"]').forEach(radio => {
        radio.addEventListener('change', handleDecisionChange);
    });
    document.getElementById('saveNextBtn').addEventListener('click', handleSaveNext);
    document.getElementById('skipBtn').addEventListener('click', handleSkip);
    document.getElementById('previousBtn').addEventListener('click', handlePrevious);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('viewSummaryBtn').addEventListener('click', showSummaryPage);
    document.getElementById('viewSummaryFromComplete').addEventListener('click', showSummaryPage);
    document.getElementById('backToReviewBtn').addEventListener('click', showReviewPage);
    document.getElementById('logoutFromSummaryBtn').addEventListener('click', handleLogout);
}

// JSONP API call function
function apiCall(endpoint, params = {}, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        let url = `${API_URL}?action=${endpoint}`;
        
        const allParams = {...params};
        if (body) {
            Object.assign(allParams, body);
        }
        
        Object.keys(allParams).forEach(key => {
            url += `&${key}=${encodeURIComponent(allParams[key])}`;
        });
        
        const callbackName = 'jsonp_callback_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        url += `&callback=${callbackName}`;
        
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Request timeout - Please check your connection'));
        }, 30000);
        
        window[callbackName] = function(data) {
            clearTimeout(timeout);
            cleanup();
            
            if (data.error) {
                reject(new Error(data.error));
            } else {
                resolve(data);
            }
        };
        
        const script = document.createElement('script');
        script.src = url;
        script.onerror = function() {
            clearTimeout(timeout);
            cleanup();
            reject(new Error('Failed to connect to server'));
        };
        
        function cleanup() {
            delete window[callbackName];
            if (script.parentNode) {
                script.parentNode.removeChild(script);
            }
        }
        
        document.head.appendChild(script);
    });
}

async function loadReviewers() {
    try {
        const data = await apiCall('getReviewers');
        const select = document.getElementById('reviewerSelect');
        select.innerHTML = '<option value="">-- Select your name --</option>';
        
        data.reviewers.forEach(reviewer => {
            const option = document.createElement('option');
            option.value = reviewer;
            option.textContent = reviewer;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load reviewers:', error);
        alert('Failed to load reviewers. Please refresh the page and try again.\n\nError: ' + error.message);
    }
}

async function handleLogin() {
    const reviewer = document.getElementById('reviewerSelect').value;
    const role = document.querySelector('input[name="role"]:checked')?.value;
    
    if (!reviewer || !role) {
        alert('Please select both your name and role');
        return;
    }
    
    state.reviewer = reviewer;
    state.role = role;
    
    localStorage.setItem('reviewer', reviewer);
    localStorage.setItem('role', role);
    
    showLoading('Loading your assigned articles...');
    
    try {
        const data = await apiCall('getArticles', { reviewer, role });
        state.articles = data.articles;
        state.currentIndex = 0;
        state.reviewHistory = [];
        
        hideLoading();
        
        if (state.articles.length === 0) {
            showPage('reviewPage');
            document.getElementById('articleContent').style.display = 'none';
            document.getElementById('noArticles').style.display = 'block';
        } else {
            showPage('reviewPage');
            displayCurrentArticle();
        }
        updateReviewerInfo();
    } catch (error) {
        hideLoading();
        console.error('Failed to load articles:', error);
        alert('Failed to load articles. Please try again.\n\nError: ' + error.message);
    }
}

function displayCurrentArticle() {

      // Scroll to top of page
    window.scrollTo(0, 0);
    
    const article = state.articles[state.currentIndex];
    
    if (!article) {
        document.getElementById('articleContent').style.display = 'none';
        document.getElementById('noArticles').style.display = 'block';
        return;
    }
    
    console.log('Displaying article:', article); // Debug logging
    
    document.getElementById('loadingArticle').style.display = 'none';
    document.getElementById('noArticles').style.display = 'none';
    document.getElementById('articleContent').style.display = 'block';
    
    // Display row information with link - with null check
    const titleElement = document.getElementById('articleTitle');
    if (titleElement) {
        titleElement.innerHTML = `
            ${article.title || 'Untitled'}
            <div style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.5rem;">
                <strong>Sheet Row ${article.rowNumber}</strong> 
                <a href="${article.sheetUrl}" target="_blank" style="color: var(--primary); text-decoration: none; margin-left: 0.5rem;">
                    📊 View in Google Sheet ↗
                </a>
            </div>
        `;
    }
    
    // Safely set text content for metadata
    const setTextContent = (id, value, defaultValue = 'N/A') => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value || defaultValue;
        } else {
            console.warn(`Element not found: ${id}`);
        }
    };
    
    setTextContent('articleAuthors', article.author, 'Unknown');
    setTextContent('articleYear', article.year, 'N/A');
    setTextContent('articleSource', article.source, 'N/A');
    setTextContent('articlePublication', article.publication, 'N/A');
    setTextContent('articleType', article.publicationType, 'N/A');
    
    // Handle DOI with link
    const doiElement = document.getElementById('articleDoi');
    if (doiElement) {
        if (article.doi) {
            doiElement.innerHTML = `<a href="https://doi.org/${article.doi}" target="_blank">${article.doi}</a>`;
        } else {
            doiElement.textContent = 'N/A';
        }
    }
    
    // Handle URL with link
    const urlElement = document.getElementById('articleUrl');
    if (urlElement) {
        if (article.url) {
            urlElement.innerHTML = `<a href="${article.url}" target="_blank" class="btn btn-secondary btn-sm">🔗 Read Full Text</a>`;
        } else {
            urlElement.innerHTML = '<span style="color: var(--text-secondary);">No URL available</span>';
        }
    }
    
    // Handle abstract 
    const abstractElement = document.getElementById('articleAbstract');
    if (abstractElement) {
        abstractElement.textContent = article.abstract || 'No abstract available';
    } else {
        console.error('Abstract element not found!');
    }
    
    const duplicateContainer = document.getElementById('duplicateStatusContainer');
    const duplicateElement = document.getElementById('articleDuplicateStatus');
    if (article.isDuplicate) {
        if (duplicateContainer) duplicateContainer.style.display = 'flex';
        if (duplicateElement) duplicateElement.innerHTML = '<span class="duplicate-badge">⚠️ DUPLICATE</span>';
    } else {
        if (duplicateContainer) duplicateContainer.style.display = 'none';
    }
    // Reset form
    document.querySelectorAll('input[name="decision"]').forEach(radio => {
        radio.checked = false;
    });
    
    const reasonGroup = document.getElementById('reasonGroup');
    if (reasonGroup) {
        reasonGroup.style.display = 'none';
    }
    
    const notesElement = document.getElementById('additionalNotes');
    if (notesElement) {
        notesElement.value = '';
    }
    
    updateProgress();
    updateNavigationButtons();
}

function updateProgress() {
    const total = state.articles.length;
    const completed = state.currentIndex;
    const percentage = total > 0 ? (completed / total) * 100 : 0;
    
    document.getElementById('progressFill').style.width = `${percentage}%`;
    document.getElementById('progressText').textContent = 
        `Article ${completed + 1} of ${total} (${Math.round(percentage)}% complete)`;
}

function updateNavigationButtons() {
    const previousBtn = document.getElementById('previousBtn');
    previousBtn.disabled = state.reviewHistory.length === 0;
    
    // Visual feedback
    if (state.reviewHistory.length > 0) {
        previousBtn.style.opacity = '1';
        previousBtn.style.cursor = 'pointer';
    } else {
        previousBtn.style.opacity = '0.5';
        previousBtn.style.cursor = 'not-allowed';
    }
    
    console.log('History length:', state.reviewHistory.length);
    console.log('Current index:', state.currentIndex);
}

function updateReviewerInfo() {
    document.getElementById('reviewerInfo').textContent = 
        `${state.reviewer} (${state.role === 'C1' ? 'First' : 'Second'} Reviewer)`;
}

function handleDecisionChange(e) {
    const decision = e.target.value;
    const reasonGroup = document.getElementById('reasonGroup');
    const reasonLabel = document.getElementById('reasonLabel');
    const reasonSelect = document.getElementById('reasonSelect');
    
    if (decision === '0') {
        // Only show reasons for exclusions
        reasonGroup.style.display = 'block';
        reasonSelect.innerHTML = '<option value="">-- Select reason --</option>';
        reasonLabel.textContent = 'Reason for exclusion:';
        
        REASONS.exclude.forEach(reason => {
            const option = document.createElement('option');
            option.value = reason;
            option.textContent = reason;
            reasonSelect.appendChild(option);
        });
    } else {
        // Hide reason group for inclusions
        reasonGroup.style.display = 'none';
    }
}

async function handleSaveNext() {
    const decision = document.querySelector('input[name="decision"]:checked')?.value;
    
    if (!decision) {
        alert('Please select Include or Exclude');
        return;
    }
    
    let note = '';
    
    if (decision === '0') {
        // For exclusions, reason is required
        const reason = document.getElementById('reasonSelect').value;
        const notes = document.getElementById('additionalNotes').value.trim();
        
        if (!reason) {
            alert('Please select a reason for exclusion');
            return;
        }
        
        note = reason === 'other' ? notes : reason;
        
        if (reason === 'other' && !notes) {
            alert('Please provide additional notes for "other"');
            return;
        }
    }
    // If decision === '1' (Include), note stays empty
    
    const article = state.articles[state.currentIndex];
    
    showLoading('Saving your decision...');
    
    try {
    const additionalComments = document.getElementById('additionalNotes').value.trim();
    
    await apiCall('submitDecision', {}, 'POST', {
        rowIndex: article.rowIndex,
        reviewer: state.reviewer,
        role: state.role,
        decision: parseInt(decision),
        note: note,
        additionalComments: additionalComments
    });
        
        hideLoading();
        
        // Add current index to history BEFORE incrementing
        state.reviewHistory.push(state.currentIndex);
        state.currentIndex++;
        
        if (state.currentIndex >= state.articles.length) {
            document.getElementById('articleContent').style.display = 'none';
            document.getElementById('noArticles').style.display = 'block';
            updateNavigationButtons();
        } else {
            displayCurrentArticle();
        }
    } catch (error) {
        hideLoading();
        console.error('Failed to save decision:', error);
        alert('Failed to save decision. Please try again.\n\nError: ' + error.message);
    }
}

function handleSkip() {
    if (state.currentIndex < state.articles.length - 1) {
        state.reviewHistory.push(state.currentIndex);
        state.currentIndex++;
        displayCurrentArticle();
    } else {
        alert('This is the last article. You cannot skip further.');
    }
}

function handlePrevious() {
    if (state.reviewHistory.length > 0) {
        state.currentIndex = state.reviewHistory.pop();
        displayCurrentArticle();
    }
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');
}

async function showSummaryPage() {
    showPage('summaryPage');
    document.getElementById('summaryReviewerInfo').textContent = 
        `${state.reviewer} (${state.role === 'C1' ? 'First' : 'Second'} Reviewer)`;
    showLoading('Loading your summary...');
    await loadSummary();
    hideLoading();
}

function showReviewPage() {
    showPage('reviewPage');
}

async function loadSummary() {
    try {
        const data = await apiCall('getSummary', { 
            reviewer: state.reviewer, 
            role: state.role 
        });
        
        // Check if data and summary exist
        if (!data || !data.summary) {
            throw new Error('Invalid summary data received');
        }
        
        document.getElementById('totalReviewed').textContent = data.summary.reviewed || 0;
        document.getElementById('totalIncluded').textContent = data.summary.included || 0;
        document.getElementById('totalExcluded').textContent = data.summary.excluded || 0;
        document.getElementById('totalPending').textContent = data.summary.pending || 0;
        
        const reviewedList = document.getElementById('reviewedList');
        if (!data.reviewed || data.reviewed.length === 0) {
            reviewedList.innerHTML = '<p style="color: var(--text-secondary); padding: 1rem;">No articles reviewed yet.</p>';
        } else {
            reviewedList.innerHTML = data.reviewed.map(article => `
    <div class="article-item">
        <div class="article-item-title">${article.title}</div>
        <div class="article-item-meta">
            <span>${article.author}</span>
            <span>${article.year}</span>
            <span style="color: var(--text-secondary);">Row ${article.rowNumber}</span>
            <a href="${article.sheetUrl}" target="_blank" style="color: var(--primary); text-decoration: none;">📊 Sheet ↗</a>
        </div>
        <span class="article-item-decision ${article.decision === 1 ? 'included' : 'excluded'}">
            ${article.decision === 1 ? '✓ Included' : '✗ Excluded'}
        </span>
        ${article.note ? `<div style="margin-top: 0.5rem; font-size: 0.875rem; color: var(--text-secondary);"><strong>Reason:</strong> ${article.note}</div>` : ''}
        ${article.additionalComments ? `<div style="margin-top: 0.5rem; font-size: 0.875rem; color: var(--text-secondary);"><strong>Additional Comments:</strong> ${article.additionalComments}</div>` : ''}
    </div>
`).join('');
        }
        
        const pendingList = document.getElementById('pendingList');
        const pendingCard = document.getElementById('pendingCard');
        if (!data.pending || data.pending.length === 0) {
            pendingCard.style.display = 'none';
        } else {
            pendingCard.style.display = 'block';
            pendingList.innerHTML = data.pending.map(article => `
                <div class="article-item">
                    <div class="article-item-title">${article.title}</div>
                    <div class="article-item-meta">
                        <span>${article.author}</span>
                        <span>${article.year}</span>
                        <span style="color: var(--text-secondary);">Row ${article.rowNumber}</span>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Failed to load summary:', error);
        alert('Failed to load summary: ' + error.message + '\n\nPlease try again or contact support.');
    }
}

function handleLogout() {
    localStorage.removeItem('reviewer');
    localStorage.removeItem('role');
    
    state.reviewer = null;
    state.role = null;
    state.articles = [];
    state.currentIndex = 0;
    state.reviewHistory = [];
    
    showPage('loginPage');
}
