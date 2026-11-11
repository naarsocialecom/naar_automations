"""The automation's page on the website."""
from automations.meta_campaign_stock.page.routes import automations_bp as blueprint

# Its card on the home page
CARD = {
    'id': 'meta-campaign-stock', 'kind': 'automation', 'title': 'Meta Campaign Stock',
    'url': '/automations/meta-campaign-stock', 'icon': 'fa-bullhorn', 'job': 'meta-campaign-stock',
    'description': 'Checks the stores in active Meta campaigns for low stock and posts the report and Excel to Slack.',
}
