// team.js
document.addEventListener('DOMContentLoaded', function() {
    // Search functionality
    const searchInput = document.querySelector('.search');
    const searchBtn = document.querySelector('.search-btn');
    
    searchBtn.addEventListener('click', function() {
        const searchTerm = searchInput.value.toLowerCase();
        const roomCards = document.querySelectorAll('.room-card');
        
        roomCards.forEach(card => {
            const title = card.querySelector('.room-title').textContent.toLowerCase();
            const description = card.querySelector('.room-description').textContent.toLowerCase();
            
            if (title.includes(searchTerm) || description.includes(searchTerm)) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    });
    
    // Filter functionality
    const filterSelect = document.querySelector('.filter-select');
    filterSelect.addEventListener('change', function() {
        // Implement filter logic based on selection
        console.log('Filter by:', this.value);
    });
    
    // Add click handlers for room actions
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation(); // Prevent card click when clicking actions
        });
    });
});