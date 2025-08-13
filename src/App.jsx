import { useState, useEffect } from 'react'
import { Upload, Download, Image, AlertCircle, CheckCircle, Moon, Sun, QrCode, Plus, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button.jsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.jsx'
import { Input } from '@/components/ui/input.jsx'
import { Label } from '@/components/ui/label.jsx'
import { Alert, AlertDescription } from '@/components/ui/alert.jsx'
import QrScanner from 'qr-scanner'
import { Analytics } from '@vercel/analytics/react'
import './App.css'

function App() {
  const [uploadedImage, setUploadedImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Check localStorage for saved theme preference
    const saved = localStorage.getItem('darkMode')
    return saved ? JSON.parse(saved) : false
  })
  const [contactData, setContactData] = useState({
    name: '',
    company: '',
    phones: [''], // Change to array
    email: '',
    address: '',
    website: '',
    notes: ''
  })
  const [alert, setAlert] = useState({ type: '', message: '' })

  // Apply dark mode class to document
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode))
  }, [isDarkMode])

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode)
  }

  const handleImageUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    // Validate file type
    if (!file.type.match(/^image\/(jpeg|jpg|png)$/)) {
      setAlert({
        type: 'error',
        message: 'Please upload a valid image file (JPG or PNG format only).'
      })
      return
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setAlert({
        type: 'error',
        message: 'File size too large. Please upload an image smaller than 10MB.'
      })
      return
    }

    setUploadedImage(file)
    setAlert({ type: '', message: '' })

    // Create preview
    const reader = new FileReader()
    reader.onload = async (e) => {
      setImagePreview(e.target.result)
      
      // Try to scan for QR codes in the uploaded image
      try {
        const qrResult = await QrScanner.scanImage(file, { returnDetailedScanResult: true })
        if (qrResult && qrResult.data) {
          // Check if the QR code contains a URL
          const qrData = qrResult.data
          if (qrData.startsWith('http://') || qrData.startsWith('https://') || qrData.includes('.com') || qrData.includes('.org') || qrData.includes('.net')) {
            // Update the website field with the QR code URL
            setContactData(prev => ({
              ...prev,
              website: qrData
            }))
            setAlert({
              type: 'success',
              message: `QR code detected! Website URL "${qrData}" has been added to contact information.`
            })
          } else {
            // QR code contains other data, add to notes
            setContactData(prev => ({
              ...prev,
              notes: prev.notes ? `${prev.notes}, ${qrData}` : qrData
            }))
            setAlert({
              type: 'success',
              message: `QR code detected! Data "${qrData}" has been added to notes.`
            })
          }
        }
      } catch (qrError) {
        // No QR code found or error scanning, continue with normal processing
        console.log('No QR code found in image:', qrError)
      }
    }
    reader.readAsDataURL(file)

    // Process image with backend API
    setIsProcessing(true)
    
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      })

      // Get the response text first
      const responseText = await response.text()
      
      let data
      try {
        data = JSON.parse(responseText)
      } catch (jsonError) {
        // If response is not JSON, show the actual server error
        setAlert({
          type: 'error',
          message: `Server error: ${responseText.substring(0, 200)}...`
        })
        setIsProcessing(false)
        return
      }

      if (data.error) {
        setAlert({
          type: 'error',
          message: data.error
        })
        setIsProcessing(false)
        return
      }

      // Map backend response to frontend state
      setContactData({
        name: data.name || '',
        company: data.organization || '',
        phones: data.phone_numbers && data.phone_numbers.length > 0 ? data.phone_numbers : [''],
        email: data.email || '',
        address: data.address || '',
        website: data.url || '',
        notes: (data.titles || []).join(', ')
      })

      setAlert({
        type: 'success',
        message: 'Contact information extracted successfully! Please review and edit as needed.'
      })

    } catch (error) {
      console.error('Error processing image:', error)
      setAlert({
        type: 'error',
        message: 'Failed to process the image. Please try again.'
      })
    }

    setIsProcessing(false)
  }

  const handleInputChange = (field, value) => {
    setContactData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handlePhoneChange = (index, value) => {
    setContactData(prev => ({
      ...prev,
      phones: prev.phones.map((phone, i) => i === index ? value : phone)
    }))
  }

  const addPhoneField = () => {
    setContactData(prev => ({
      ...prev,
      phones: [...prev.phones, '']
    }))
  }

  const removePhoneField = (index) => {
    if (contactData.phones.length > 1) {
      setContactData(prev => ({
        ...prev,
        phones: prev.phones.filter((_, i) => i !== index)
      }))
    }
  }

  const generateVCF = async () => {
    if (!contactData.name.trim()) {
      setAlert({
        type: 'error',
        message: 'Name is required to generate VCF file.'
      })
      return
    }

    try {
      // Prepare data for backend API
      const vcfData = {
        name: contactData.name,
        titles: contactData.notes ? contactData.notes.split(',').map(t => t.trim()).filter(t => t) : [],
        organization: contactData.company,
        phone_numbers: contactData.phones.filter(p => p.trim()),
        email: contactData.email,
        address: contactData.address,
        url: contactData.website
      }

      const response = await fetch('/api/generate-vcf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(vcfData)
      })

      if (response.ok) {
        // Create download link
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${contactData.name.replace(/[^a-zA-Z0-9]/g, '_')}.vcf`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)

        setAlert({
          type: 'success',
          message: 'VCF file downloaded successfully!'
        })
      } else {
        // Get response text and try to parse as JSON
        const responseText = await response.text()
        let errorMessage = 'Failed to generate VCF file.'
        
        try {
          const errorData = JSON.parse(responseText)
          errorMessage = errorData.error || errorMessage
        } catch (jsonError) {
          // If not JSON, show part of the actual error response
          errorMessage = `Server error: ${responseText.substring(0, 200)}...`
        }
        
        setAlert({
          type: 'error',
          message: errorMessage
        })
      }
    } catch (error) {
      console.error('Error generating VCF:', error)
      setAlert({
        type: 'error',
        message: 'Failed to generate VCF file. Please try again.'
      })
    }
  }

  const clearAll = () => {
    setUploadedImage(null)
    setImagePreview(null)
    setContactData({
      name: '',
      company: '',
      phones: [''],
      email: '',
      address: '',
      website: '',
      notes: ''
    })
    setAlert({ type: '', message: '' })
    setIsProcessing(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4 transition-colors duration-300 background-pattern">
      <Analytics />
      
      <div className="max-w-4xl mx-auto content-layer">
        {/* Header */}
        <div className="text-center mb-8 relative">
          {/* Dark Mode Toggle */}
          <div className="absolute top-0 right-0">
            <Button
              onClick={toggleDarkMode}
              variant="outline"
              size="sm"
              className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-800"
            >
              {isDarkMode ? (
                <Sun className="h-4 w-4 text-yellow-500" />
              ) : (
                <Moon className="h-4 w-4 text-gray-600" />
              )}
            </Button>
          </div>
          
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Card Scanner
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Upload a photo of any visiting card or business card, and we'll extract the contact information for you. 
            QR codes on cards will be automatically scanned for website links. Edit the details and download as a VCF file to import directly into your phone contacts.
          </p>
        </div>

        {/* Alert */}
        {alert.message && (
          <Alert className={`mb-6 ${alert.type === 'error' ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/50' : 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/50'}`}>
            {alert.type === 'error' ? (
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            ) : (
              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            )}
            <AlertDescription className={alert.type === 'error' ? 'text-red-800 dark:text-red-200' : 'text-green-800 dark:text-green-200'}>
              {alert.message}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upload Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Visiting Card
              </CardTitle>
              <CardDescription>
                Supported formats: JPG, PNG (max 10MB). QR codes will be automatically detected and scanned.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center hover:border-gray-400 dark:hover:border-gray-500 transition-colors">
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png"
                    onChange={handleImageUpload}
                    className="hidden"
                    id="image-upload"
                  />
                  <label htmlFor="image-upload" className="cursor-pointer">
                    <Image className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                    <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Click to upload or drag and drop
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      JPG or PNG files only
                    </p>
                  </label>
                </div>

                {imagePreview && (
                  <div className="mt-4">
                    <img
                      src={imagePreview}
                      alt="Uploaded card"
                      className="w-full h-48 object-contain border rounded-lg bg-gray-50 dark:bg-gray-800 dark:border-gray-600"
                    />
                  </div>
                )}

                {isProcessing && (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400 mx-auto mb-2"></div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Processing image...</p>
                  </div>
                )}

                {uploadedImage && (
                  <Button onClick={clearAll} variant="outline" className="w-full">
                    Upload New Card
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Contact Information Section */}
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
              <CardDescription>
                Review and edit the extracted information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={contactData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder="Enter full name"
                  />
                </div>

                <div>
                  <Label htmlFor="company">Company</Label>
                  <Input
                    id="company"
                    value={contactData.company}
                    onChange={(e) => handleInputChange('company', e.target.value)}
                    placeholder="Enter company name"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Phone Numbers</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addPhoneField}
                      className="h-8 w-8 p-0"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {contactData.phones.map((phone, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          value={phone}
                          onChange={(e) => handlePhoneChange(index, e.target.value)}
                          placeholder="Enter phone number"
                          className="flex-1"
                        />
                        {contactData.phones.length > 1 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => removePhoneField(index)}
                            className="h-10 w-10 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={contactData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="Enter email address"
                  />
                </div>

                <div>
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    value={contactData.address}
                    onChange={(e) => handleInputChange('address', e.target.value)}
                    placeholder="Enter address"
                  />
                </div>

                <div>
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    value={contactData.website}
                    onChange={(e) => handleInputChange('website', e.target.value)}
                    placeholder="Enter website URL"
                  />
                </div>

                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Input
                    id="notes"
                    value={contactData.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    placeholder="Add any additional notes"
                  />
                </div>

                <Button 
                  onClick={generateVCF} 
                  className="w-full"
                  disabled={!contactData.name && !contactData.phones.some(p => p.trim()) && !contactData.email}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download VCF File
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Instructions */}
        <Card className="mt-6">
          <CardContent className="pt-6">
            <h3 className="font-semibold mb-2 dark:text-white">How to use:</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
              <li>Upload a clear photo of a visiting card or business card (JPG or PNG format)</li>
              <li>Wait for the AI to extract the contact information automatically. QR codes will also be scanned for website links.</li>
              <li>Review and edit the extracted information in the form fields</li>
              <li>Click "Download VCF File" to save the contact to your device</li>
              <li>Import the VCF file into your phone's contacts app</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default App

