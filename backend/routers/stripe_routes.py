import stripe
import os
from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from database import get_db
from models import User
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")

PRICE_ID = "price_1TIRmUFJ2ccyO6YNpGuzuNqp"

@router.post("/stripe/create-checkout-session")
async def create_checkout_session(request: Request, db: Session = Depends(get_db)):
    body = await request.json()
    clerk_id = body.get("clerkId")
    
    user = db.query(User).filter(User.clerk_id == clerk_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    checkout_session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[{"price": PRICE_ID, "quantity": 1}],
        mode="subscription",
        success_url="http://localhost:3000/dashboard?success=true",
        cancel_url="http://localhost:3000/dashboard?cancelled=true",
        metadata={"clerk_id": clerk_id},
        
    )
    
    return JSONResponse({"url": checkout_session.url})

@router.post("/stripe/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, STRIPE_WEBHOOK_SECRET
        )
    
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")
    
    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        clerk_id = session["metadata"]["clerk_id"]
        
        user = db.query(User).filter(User.clerk_id == clerk_id).first()
        if user:
            user.plan = "pro"
            db.commit()
    
    return JSONResponse({"status": "success"})



