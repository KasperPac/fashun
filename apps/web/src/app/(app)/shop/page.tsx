import SaveToWardrobeButton from '@/components/wardrobe/SaveToWardrobeButton'

// Placeholder products — replaced in Phase 4 with real Commission Factory feed
const DEMO_PRODUCTS = [
  {
    id: '1',
    name: 'Classic White Linen Shirt',
    imageUrl: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&q=80',
    storeUrl: 'https://www.theiconic.com.au',
    price: 89,
    retailer: 'THE ICONIC',
    category: 'tops',
    colours: ['#ffffff', '#f5f5dc'],
  },
  {
    id: '2',
    name: 'Slim Fit Chinos',
    imageUrl: 'https://images.unsplash.com/photo-1584370848010-d7fe6bc767ec?w=400&q=80',
    storeUrl: 'https://www.countryroad.com.au',
    price: 149,
    retailer: 'Country Road',
    category: 'bottoms',
    colours: ['#8B7355'],
  },
]

export default function ShopPage() {
  return (
    <div className="min-h-screen bg-black text-white px-4 py-6 pb-24">
      <h1 className="text-2xl font-black mb-2">Shop 🛍️</h1>
      <p className="text-zinc-500 text-sm mb-6">Australian retailers · filtered by your palette · Phase 1 demo</p>
      <div className="grid grid-cols-2 gap-4">
        {DEMO_PRODUCTS.map(product => (
          <div key={product.id} className="bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={product.imageUrl} alt={product.name} className="w-full aspect-square object-cover" />
            <div className="p-3">
              <p className="text-sm font-semibold text-white truncate">{product.name}</p>
              <p className="text-xs text-zinc-500 mb-2">{product.retailer} · ${product.price}</p>
              <div className="flex gap-2">
                <SaveToWardrobeButton item={product} />
                <a
                  href={product.storeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-amber-400 font-bold py-1.5 hover:underline"
                >
                  Buy AU →
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
