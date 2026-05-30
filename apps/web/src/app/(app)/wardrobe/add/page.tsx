import AddItemForm from '@/components/wardrobe/AddItemForm'

export default function AddItemPage() {
  return (
    <div className="min-h-screen bg-black text-white px-4 py-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <a href="/wardrobe" className="text-zinc-500 hover:text-white text-xl">←</a>
        <h1 className="text-xl font-black">Add Item</h1>
      </div>
      <AddItemForm />
    </div>
  )
}
